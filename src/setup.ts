import { mkdir, readFile, writeFile, unlink, chmod, rename, lstat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseConfiguration } from './config.js';
import { routerMarker } from './process.js';

export const configText = 'schema = 1\n\n[[middleware]]\nid = "demo"\nenabled = true\n';
export const routePath = '.config/mise/conf.d/arch.toml';
export const statePath = '.arch/bootstrap.json';
export const uninstallPath = '.arch/uninstall.json';
export interface State {
  files: Record<string, string>;
  createdHarness: boolean;
}
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

export async function readOptional(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch (error) {
    if ('ENOENT' === (error as NodeJS.ErrnoException).code) {
      return undefined;
    }
    throw error;
  }
}
export function stateFrom(text: Buffer): State {
  const state: unknown = JSON.parse(text.toString());
  if (!isOwnershipState(state)) {
    throw new Error('Invalid bootstrap state');
  }
  return state;
}
function isOwnershipState(state: unknown): state is State {
  if (
    null === state ||
    'object' !== typeof state ||
    Array.isArray(state) ||
    !('files' in state) ||
    null === state.files ||
    'object' !== typeof state.files ||
    Array.isArray(state.files) ||
    !('createdHarness' in state) ||
    'boolean' !== typeof state.createdHarness ||
    Object.entries(state.files).some(
      ([file, hash]: [string, unknown]) =>
        !(file === routePath || /^\.arch\/bin\/(?!\.{1,2}$)[a-zA-Z0-9_.-]+$/.test(file)) ||
        'string' !== typeof hash ||
        !/^[a-f0-9]{64}$/.test(hash),
    )
  ) {
    return false;
  }
  return true;
}
export async function checkFiles(root: string, files: Record<string, string>, recovering = false) {
  for (const [file, hash] of Object.entries(files)) {
    await assertSafePath(root, file);
    const contents = await readOptional(join(root, file));
    if (contents === undefined && recovering) {
      continue;
    }
    if (!contents || digest(contents) !== hash) {
      throw new Error(`Managed file changed; refusing to overwrite/remove: ${file}`);
    }
  }
}

export async function setup(root: string, commands: readonly string[]): Promise<void> {
  root = resolve(root);
  for (const file of [statePath, uninstallPath, '.arch/routing.json', '.arch/harness.toml']) {
    await assertSafePath(root, file);
  }
  if ((await readOptional(join(root, '.arch/routing.json'))) !== undefined) {
    throw new Error(
      'Routing recovery pending; use configure with the recorded desired routes or deinit --yes',
    );
  }
  if ((await readOptional(join(root, uninstallPath))) !== undefined) {
    throw new Error('Uninstall in progress; run uninstall before initialization');
  }
  validateCommands(commands);
  const contents = await renderFiles(commands);
  const files = Object.fromEntries([...contents].map(([file, text]) => [file, digest(text)]));
  const harnessFile = join(root, '.arch/harness.toml'),
    stateFile = join(root, statePath);
  const [existingHarness, existingState] = await Promise.all([
    readOptional(harnessFile),
    readOptional(stateFile),
  ]);
  if (existingHarness !== undefined) {
    parseConfiguration(existingHarness.toString(), root);
  }
  if (existingState) {
    const state = stateFrom(existingState);
    const names = (value: Record<string, string>) =>
      Object.keys(value)
        .map((file) => ('win32' === process.platform ? file.toLowerCase() : file))
        .sort();
    // Existing launchers may capture an older checkout/runtime. Their recorded
    // ownership hashes, not today's renderer bytes or insertion order, are authoritative.
    if (JSON.stringify(names(state.files)) !== JSON.stringify(names(files))) {
      throw new Error('Arch setup differs; use configure <commands...> to change routed commands');
    }
    await checkFiles(root, state.files);
    return;
  }
  for (const file of contents.keys()) {
    await assertSafePath(root, file);
    if ((await readOptional(join(root, file))) !== undefined) {
      throw new Error(`Refusing to overwrite ${file}`);
    }
  }
  const created: string[] = [];
  try {
    for (const [file, text] of [
      ...contents,
      ...(existingHarness === undefined ? [['.arch/harness.toml', configText] as const] : []),
      [
        statePath,
        JSON.stringify(
          { files, createdHarness: existingHarness === undefined } satisfies State,
          null,
          2,
        ) + '\n',
      ] as const,
    ]) {
      const target = join(root, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, text, { flag: 'wx' });
      created.push(target);
      if (file.startsWith('.arch/bin/') && 'win32' !== process.platform) {
        await chmod(target, 0o755);
      }
    }
  } catch (error) {
    for (const file of created.reverse()) {
      await unlink(file);
    }
    throw error;
  }
}

export async function uninstall(root: string): Promise<void> {
  root = resolve(root);
  for (const file of [statePath, uninstallPath, '.arch/routing.json', '.arch/harness.toml']) {
    await assertSafePath(root, file);
  }
  if ((await readOptional(join(root, '.arch/routing.json'))) !== undefined) {
    throw new Error('Routing recovery pending; finish configure before uninstall');
  }
  const stateFile = join(root, statePath),
    journalFile = join(root, uninstallPath);
  const [text, recovery] = await Promise.all([readOptional(stateFile), readOptional(journalFile)]);
  if (text === undefined && recovery === undefined) {
    return;
  }
  if (text !== undefined && recovery !== undefined) {
    throw new Error('Conflicting bootstrap and uninstall state; refusing to remove files');
  }
  const state = stateFrom((recovery ?? text)!);
  await checkFiles(root, state.files, recovery !== undefined);
  if (recovery === undefined) {
    // Atomic rename retains the complete ownership manifest before the first deletion.
    try {
      await rename(stateFile, journalFile);
    } catch (error) {
      throw new Error(`Unable to start uninstall: ${stateFile}`, { cause: error });
    }
  }
  const remove = async (file: string, operation: string) => {
    try {
      await unlink(file);
    } catch (error) {
      if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
        throw new Error(`Unable to ${operation}: ${file}`, { cause: error });
      }
    }
  };
  for (const file of Object.keys(state.files)) {
    await remove(join(root, file), 'remove managed file');
  }
  const harnessFile = join(root, '.arch/harness.toml');
  if (state.createdHarness && (await readOptional(harnessFile))?.toString() === configText) {
    await remove(harnessFile, 'remove generated configuration');
  }
  await remove(journalFile, 'remove uninstall state');
}

// Check every managed component before reading or mutating it; never follow a
// project-local symlink into another installation. This is not a hostile-race lock.
export async function assertSafePath(root: string, file: string): Promise<void> {
  let target = resolve(root);
  for (const component of file.split('/')) {
    target = join(target, component);
    try {
      if ((await lstat(target)).isSymbolicLink()) {
        throw new Error(`Refusing managed symlink: ${file}`);
      }
    } catch (error) {
      if ('ENOENT' === (error as NodeJS.ErrnoException).code) {
        return;
      }
      throw error;
    }
  }
}

export function validateCommands(
  commands: readonly string[],
  windows = 'win32' === process.platform,
): void {
  if (
    !commands.length ||
    new Set(commands.map((c) => (windows ? c.toLowerCase() : c))).size !== commands.length ||
    commands.some(
      (c) =>
        !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c) || ['node', 'mise', 'arch'].includes(c.toLowerCase()),
    )
  ) {
    throw new Error('Supply unique executable names (node, mise, and arch are reserved)');
  }
}

export async function renderFiles(
  commands: readonly string[],
): Promise<Map<string, string | Buffer>> {
  const cli = fileURLToPath(new URL('./cli.js', import.meta.url));
  const contents = new Map<string, string | Buffer>([
    [routePath, '# Generated by Arch.\n[env]\n_.path = ["{{config_root}}/.arch/bin"]\n'],
    ['.arch/bin/.arch-router', routerMarker],
  ]);
  for (const command of commands) {
    if ('win32' === process.platform) {
      if (!['x64', 'arm64'].includes(process.arch)) {
        throw new Error('Windows bootstrap supports x64 and arm64');
      }
      const shim = await readFile(new URL(`../vendor/shim-${process.arch}.exe`, import.meta.url));
      contents.set(`.arch/bin/${command}.exe`, shim);
      contents.set(
        `.arch/bin/${command}.shim`,
        `path = ${process.execPath}\nargs = "${cli}" run ${command} --\n`,
      );
    } else {
      contents.set(
        `.arch/bin/${command}`,
        `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(cli)} run ${quote(command)} -- "$@"\n`,
      );
    }
  }
  return contents;
}
