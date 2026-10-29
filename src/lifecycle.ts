import { chmod, link, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';
import { randomUUID } from 'node:crypto';
import { nativeEnvironment, resolveExecutable } from './process.js';
import { parseConfiguration } from './config.js';
import {
  assertSafePath,
  checkFiles,
  digest,
  readOptional,
  renderFiles,
  routePath,
  setup,
  stateFrom,
  statePath,
  uninstallPath,
  uninstall,
  validateCommands,
  type State,
} from './setup.js';

export const routingPath = '.arch/routing.json';
const journalStage = '.arch/routing.stage';
const markerPath = '.arch/bin/.arch-router';
const encode = (state: State) => JSON.stringify(state, null, 2) + '\n';
const equal = (a: State, b: State) =>
  a.createdHarness === b.createdHarness &&
  JSON.stringify(Object.entries(a.files).sort()) === JSON.stringify(Object.entries(b.files).sort());
const key = (name: string) => (process.platform === 'win32' ? name.toLowerCase() : name);

export function manifestRoutes(state: State): { commands: string[]; windows: boolean } {
  const paths = Object.keys(state.files);
  if (!state.files[routePath] || !state.files[markerPath])
    throw new Error('Incomplete routing manifest: missing mise integration or router marker');
  const launchers = paths.filter((path) => path !== routePath && path !== markerPath);
  const windows = launchers.some((path) => /\.(exe|shim)$/.test(path));
  const commands = launchers
    .filter((path) => !windows || path.endsWith('.exe'))
    .map((path) => path.slice('.arch/bin/'.length).replace(windows ? /\.exe$/ : /$/, ''));
  validateCommands(commands, windows);
  // Validate case identity using the installation layout even on a foreign host.
  if (windows && new Set(commands.map((c) => c.toLowerCase())).size !== commands.length)
    throw new Error('Duplicate Windows routes');
  const expected = commands.flatMap((command) =>
    windows ? [`.arch/bin/${command}.exe`, `.arch/bin/${command}.shim`] : [`.arch/bin/${command}`],
  );
  if (expected.length !== launchers.length || expected.some((path) => !state.files[path]))
    throw new Error('Incomplete routing manifest: invalid launcher set or missing exe/shim pair');
  return { commands, windows };
}

interface RoutingJournal {
  schema: 1;
  id: string;
  before: State;
  after: State;
  additions: Record<string, string>;
}
export interface RoutingPlan {
  before: State;
  after: State;
  additions: Record<string, string>;
  removed: string[];
}
export interface LifecycleOptions {
  checkpoint?: (phase: string) => void | Promise<void>;
}

function journalFrom(text: Buffer): RoutingJournal {
  const value = JSON.parse(text.toString()) as RoutingJournal;
  if (
    !value ||
    value.schema !== 1 ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.id) ||
    !value.additions ||
    typeof value.additions !== 'object' ||
    Array.isArray(value.additions)
  )
    throw new Error('Invalid routing journal');
  const before = stateFrom(Buffer.from(JSON.stringify(value.before))),
    after = stateFrom(Buffer.from(JSON.stringify(value.after)));
  const oldRoutes = manifestRoutes(before),
    newRoutes = manifestRoutes(after);
  if (oldRoutes.windows !== newRoutes.windows || before.createdHarness !== after.createdHarness)
    throw new Error('Invalid routing journal ownership');
  for (const path of [routePath, markerPath])
    if (before.files[path] !== after.files[path])
      throw new Error('Invalid routing journal integration');
  for (const [path, hash] of Object.entries(after.files)) {
    if (before.files[path]) {
      if (hash !== before.files[path] || path in value.additions)
        throw new Error('Invalid routing journal retained file');
    } else {
      const payload = value.additions[path];
      if (
        typeof payload !== 'string' ||
        Buffer.from(payload, 'base64').toString('base64') !== payload ||
        digest(Buffer.from(payload, 'base64')) !== hash
      )
        throw new Error('Invalid routing journal payload');
    }
  }
  if (Object.keys(value.additions).some((path) => !after.files[path] || before.files[path]))
    throw new Error('Invalid routing journal additions');
  return { ...value, before, after };
}

async function readAt(root: string, path: string) {
  await assertSafePath(root, path);
  return readOptional(join(root, path));
}
function staging(journal: RoutingJournal, index: number | 'manifest') {
  return `.arch/.routing-${journal.id}-${index}.stage`;
}
async function verifyStage(root: string, path: string, bytes: Buffer) {
  const existing = await readAt(root, path);
  if (existing !== undefined && !existing.equals(bytes))
    throw new Error(
      `Routing staging file changed or incomplete: ${path}; preserve it and restore the journal-recorded bytes before retrying`,
    );
}
async function stage(root: string, path: string, bytes: Buffer, executable = false) {
  await verifyStage(root, path, bytes);
  if ((await readAt(root, path)) === undefined)
    await writeFile(join(root, path), bytes, { flag: 'wx' });
  if (executable && process.platform !== 'win32') await chmod(join(root, path), 0o755);
}
async function removeOptional(root: string, path: string) {
  await assertSafePath(root, path);
  try {
    await unlink(join(root, path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error(`Unable to remove routing resource: ${path}`, { cause: error });
  }
}

async function publishExclusive(root: string, stage: string, target: string) {
  await assertSafePath(root, target);
  try {
    await link(join(root, stage), join(root, target));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown error';
    throw new Error(
      `Unable to publish ${target} exclusively (${code}). Routing reconciliation requires hard-link support; exFAT does not provide it, and other filesystems or mounts may also lack it. Use a hard-link-capable local filesystem such as NTFS, APFS, or ext4 where supported and configured appropriately. Also check destination collisions and permissions. No fallback was attempted; existing owned files were not overwritten. Preserve any staging/journal files and use status to inspect recovery`,
      { cause: error },
    );
  }
}

async function validateRecovery(root: string, journal: RoutingJournal) {
  if ((await readAt(root, uninstallPath)) !== undefined)
    throw new Error('Conflicting routing and uninstall journals');
  const bootstrap = await readAt(root, statePath);
  if (!bootstrap) throw new Error('Missing bootstrap during routing recovery');
  const current = stateFrom(bootstrap);
  if (!equal(current, journal.before) && !equal(current, journal.after))
    throw new Error('Bootstrap changed during routing recovery');
  for (const path of new Set([
    ...Object.keys(journal.before.files),
    ...Object.keys(journal.after.files),
  ])) {
    const bytes = await readAt(root, path);
    const retained = !!journal.before.files[path] && !!journal.after.files[path];
    if (bytes === undefined && !retained) continue;
    if (
      bytes === undefined ||
      digest(bytes) !== (journal.after.files[path] ?? journal.before.files[path])
    )
      throw new Error(`Managed file changed during routing recovery: ${path}`);
  }
  await verifyStage(root, journalStage, Buffer.from(JSON.stringify(journal, null, 2) + '\n'));
  for (const [index, payload] of Object.values(journal.additions).entries())
    await verifyStage(root, staging(journal, index), Buffer.from(payload, 'base64'));
  await verifyStage(root, staging(journal, 'manifest'), Buffer.from(encode(journal.after)));
}

async function applyJournal(root: string, journal: RoutingJournal, options: LifecycleOptions) {
  await validateRecovery(root, journal);
  await options.checkpoint?.('journal');
  for (const [index, [path, payload]] of Object.entries(journal.additions).entries()) {
    const bytes = Buffer.from(payload, 'base64'),
      temporary = staging(journal, index);
    await stage(root, temporary, bytes, true);
    await options.checkpoint?.(`staged:${path}`);
    if ((await readAt(root, path)) === undefined) {
      // link is exclusive: unlike rename, it never replaces a destination collision.
      await publishExclusive(root, temporary, path);
    }
    await options.checkpoint?.(`published:${path}`);
  }
  await checkFiles(root, journal.after.files);
  for (const path of Object.keys(journal.before.files).filter(
    (path) => !journal.after.files[path],
  )) {
    const bytes = await readAt(root, path);
    if (bytes !== undefined && digest(bytes) !== journal.before.files[path])
      throw new Error(`Managed file changed: ${path}`);
    await removeOptional(root, path);
    await options.checkpoint?.(`removed:${path}`);
  }
  const temporary = staging(journal, 'manifest');
  await stage(root, temporary, Buffer.from(encode(journal.after)));
  await validateRecovery(root, journal);
  await options.checkpoint?.('before-manifest');
  // Same-directory replacement. Sharing failures retain both checkpoint and stage.
  await rename(join(root, temporary), join(root, statePath));
  await options.checkpoint?.('manifest');
  await checkFiles(root, journal.after.files);
  for (const [index, payload] of Object.values(journal.additions).entries()) {
    const path = staging(journal, index);
    await verifyStage(root, path, Buffer.from(payload, 'base64'));
    await removeOptional(root, path);
  }
  await verifyStage(root, journalStage, Buffer.from(JSON.stringify(journal, null, 2) + '\n'));
  await removeOptional(root, journalStage);
  await options.checkpoint?.('cleanup');
  await removeOptional(root, routingPath);
}

export async function planRoutes(root: string, commands: readonly string[]): Promise<RoutingPlan> {
  root = resolve(root);
  validateCommands(commands);
  if (
    (await readAt(root, uninstallPath)) !== undefined ||
    (await readAt(root, routingPath)) !== undefined
  )
    throw new Error('Recovery pending; finish the recorded operation first');
  const text = await readAt(root, statePath);
  if (!text) throw new Error('Arch is not initialized; use init <commands...>');
  const before = stateFrom(text),
    layout = manifestRoutes(before);
  if (layout.windows !== (process.platform === 'win32'))
    throw new Error(
      'Foreign-platform installation; deinitialize on its original platform or inspect ownership before moving it',
    );
  await checkFiles(root, before.files);
  const canonical = commands.map(
    (command) => layout.commands.find((old) => key(old) === key(command)) ?? command,
  );
  const generated = await renderFiles(canonical);
  const after: State = { files: {}, createdHarness: before.createdHarness },
    additions: Record<string, string> = {};
  for (const [path, bytes] of generated) {
    after.files[path] = before.files[path] ?? digest(bytes);
    if (!before.files[path]) {
      if ((await readAt(root, path)) !== undefined)
        throw new Error(`Refusing to overwrite ${path}`);
      additions[path] = Buffer.from(bytes).toString('base64');
    }
  }
  return {
    before,
    after,
    additions,
    removed: Object.keys(before.files).filter((path) => !after.files[path]),
  };
}

export async function reconcileRoutes(
  root: string,
  commands: readonly string[],
  options: LifecycleOptions = {},
): Promise<void> {
  root = resolve(root);
  validateCommands(commands);
  const existing = await readAt(root, routingPath);
  if (existing !== undefined) {
    const journal = journalFrom(existing),
      desired = manifestRoutes(journal.after).commands;
    if (JSON.stringify(desired.map(key).sort()) !== JSON.stringify(commands.map(key).sort()))
      throw new Error(
        `Routing recovery pending; run configure ${desired.join(' ')} or deinit --yes`,
      );
    await applyJournal(root, journal, options);
    return;
  }
  const plan = await planRoutes(root, commands);
  if (equal(plan.before, plan.after)) return;
  const journal: RoutingJournal = {
    schema: 1,
    id: randomUUID(),
    before: plan.before,
    after: plan.after,
    additions: plan.additions,
  };
  const bytes = Buffer.from(JSON.stringify(journal, null, 2) + '\n');
  if ((await readAt(root, journalStage)) !== undefined)
    throw new Error(
      `Unreferenced staging file: ${journalStage}; inspect and move it before retrying`,
    );
  await stage(root, journalStage, bytes);
  const latest = await readAt(root, statePath);
  if (!latest || !equal(stateFrom(latest), plan.before))
    throw new Error('Bootstrap changed before routing update');
  if ((await readAt(root, uninstallPath)) !== undefined)
    throw new Error('Uninstall started before routing update');
  await publishExclusive(root, journalStage, routingPath);
  await applyJournal(root, journal, options);
}

export async function deinitialize(root: string): Promise<void> {
  root = resolve(root);
  const text = await readAt(root, routingPath);
  if (text) await applyJournal(root, journalFrom(text), {});
  await uninstall(root);
}
export async function addRoutes(root: string, commands: readonly string[]) {
  validateCommands(commands);
  const current = await configuredRoutes(root);
  await reconcileRoutes(root, [
    ...current,
    ...commands.filter((command) => !current.some((old) => key(old) === key(command))),
  ]);
}
export async function removeRoutes(root: string, commands: readonly string[]) {
  validateCommands(commands);
  const desired = (await configuredRoutes(root)).filter(
    (old) => !commands.some((command) => key(command) === key(old)),
  );
  if (!desired.length) throw new Error('Cannot remove the final route; use deinit --yes');
  await reconcileRoutes(root, desired);
}
export async function configuredRoutes(root: string): Promise<string[]> {
  const status = await inspectInstallation(root);
  if (status.state !== 'initialized')
    throw new Error(`Cannot list/update routes: ${status.state}. ${status.warnings.join(' ')}`);
  return status.routes;
}

export interface InstallationStatus {
  schema: 1;
  projectRoot: string;
  state: 'uninitialized' | 'initialized' | 'recovery_pending' | 'invalid_state';
  routes: string[];
  integrity: 'valid' | 'invalid' | 'not_applicable';
  recoveryPending: boolean;
  managedPaths: string[];
  warnings: string[];
  pendingOperation?: 'routing' | 'uninstall';
  desiredRoutes?: string[];
  activation: {
    miseAvailable: boolean | null;
    projectBinOnPath: boolean;
    shellActivation: 'unknown';
  };
}
export async function inspectInstallation(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<InstallationStatus> {
  root = resolve(root);
  const pathKey = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  const status: InstallationStatus = {
    schema: 1,
    projectRoot: root,
    state: 'uninitialized',
    routes: [],
    integrity: 'not_applicable',
    recoveryPending: false,
    managedPaths: [],
    warnings: [],
    activation: {
      miseAvailable: null,
      projectBinOnPath: (env[pathKey] ?? '')
        .split(delimiter)
        .filter(Boolean)
        .some((path) => key(resolve(root, path)) === key(join(root, '.arch/bin'))),
      shellActivation: 'unknown',
    },
  };
  try {
    await resolveExecutable('mise', root, await nativeEnvironment(env, root));
    status.activation.miseAvailable = true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Native executable not found:'))
      status.activation.miseAvailable = false;
  }
  if (status.activation.miseAvailable !== true)
    status.warnings.push(
      'mise was not detected; install and activate mise, then refresh the shell and trust the project when prompted.',
    );
  status.warnings.push(
    'Shell activation is not verified; PATH presence alone does not prove routing. Use mise exec -- <command> for explicit activation.',
  );
  try {
    const [bootstrap, removal, routing] = await Promise.all(
      [statePath, uninstallPath, routingPath].map((path) => readAt(root, path)),
    );
    status.recoveryPending = removal !== undefined || routing !== undefined;
    if (
      (bootstrap !== undefined && removal !== undefined) ||
      (removal !== undefined && routing !== undefined)
    )
      throw new Error('Conflicting bootstrap/operation journals');
    if (routing !== undefined) {
      const journal = journalFrom(routing);
      status.pendingOperation = 'routing';
      status.desiredRoutes = manifestRoutes(journal.after).commands;
      status.routes = manifestRoutes(journal.before).commands;
      status.managedPaths = [
        ...new Set([...Object.keys(journal.before.files), ...Object.keys(journal.after.files)]),
      ];
      await validateRecovery(root, journal);
      status.state = 'recovery_pending';
      status.integrity = 'valid';
      status.warnings.push(
        `Resume with configure ${status.desiredRoutes.join(' ')} or deinit --yes.`,
      );
    } else if (removal !== undefined || bootstrap !== undefined) {
      const state = stateFrom((removal ?? bootstrap)!);
      status.managedPaths = Object.keys(state.files);
      if (removal !== undefined) {
        status.pendingOperation = 'uninstall';
        await checkFiles(root, state.files, true);
        status.state = 'recovery_pending';
        status.warnings.push('Resume with deinit --yes (or legacy uninstall).');
      } else {
        status.routes = manifestRoutes(state).commands;
        await checkFiles(root, state.files);
        status.state = 'initialized';
      }
      status.integrity = 'valid';
    }
    if (!routing && (await readAt(root, journalStage)) !== undefined)
      status.warnings.push(
        'Unreferenced .arch/routing.stage; inspect and move it before another routing update.',
      );
    const harness = await readAt(root, '.arch/harness.toml');
    if (status.state === 'initialized' && harness === undefined)
      status.warnings.push('Middleware configuration is absent; execution uses native fallback.');
    if (harness !== undefined) {
      try {
        parseConfiguration(harness.toString(), root);
      } catch {
        status.warnings.push(
          'Middleware configuration is invalid; restore valid .arch/harness.toml before execution. Routing ownership is reported independently.',
        );
      }
    }
  } catch (error) {
    status.state = 'invalid_state';
    status.integrity = 'invalid';
    status.warnings.push(
      `${error instanceof Error ? error.message : String(error)}. Restore recorded owned bytes or resolve the ownership conflict before mutation.`,
    );
  }
  return status;
}

// Re-export the existing initializer for programmatic consumers of this module.
export { setup };
