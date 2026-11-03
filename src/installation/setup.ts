import { mkdir, mkdtemp, writeFile, unlink, chmod, lstat, rmdir } from 'node:fs/promises';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { parseConfiguration } from '../config.js';
import {
  configText,
  statePath,
  uninstallPath,
  digest,
  stateFrom,
  validateCommands,
  type State,
} from '../lifecycle/manifest.js';
import { readOptional, checkFiles, assertSafePath } from '../lifecycle/ownership.js';

import { publishExclusive, readAt, removeOptional } from '../lifecycle/routing-files.js';

import { renderFiles } from './renderer.js';

interface PreparedFile {
  file: string;
  stage: string;
  hash: string;
  dev: number;
  ino: number;
}

// Private stages and published rollback targets need both invocation provenance
// and unchanged bytes. Matching renderer bytes alone never authorize removal.
async function verifySetupOwnership(root: string, resource: PreparedFile, path: string) {
  await assertSafePath(root, path);
  const [identity, bytes] = await Promise.all([lstat(join(root, path)), readAt(root, path)]);
  if (
    identity.dev !== resource.dev ||
    identity.ino !== resource.ino ||
    bytes === undefined ||
    digest(bytes) !== resource.hash
  ) {
    throw new Error(`Setup cleanup ownership changed: ${path}; preserve for inspection`);
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
  await mkdir(join(root, '.arch'), { recursive: true });
  const directory = await mkdtemp(join(root, '.arch/.setup-'));
  const prepared: PreparedFile[] = [];
  const created: typeof prepared = [];
  let committed = false;
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
      const staged = join(directory, String(prepared.length));
      await writeFile(staged, text, { flag: 'wx' });
      if (file.startsWith('.arch/bin/') && 'win32' !== process.platform) {
        await chmod(staged, 0o755);
      }
      const stage = relative(root, staged).split(sep).join('/');
      const hash = digest(text);
      if (digest((await readAt(root, stage)) ?? Buffer.alloc(0)) !== hash) {
        throw new Error(
          `Setup staging file changed or incomplete: ${stage}; preserve for inspection`,
        );
      }
      const { dev, ino } = await lstat(staged);
      prepared.push({ file, stage, hash, dev, ino });
    }
    for (const resource of prepared) {
      await mkdir(dirname(join(root, resource.file)), { recursive: true });
      await assertSafePath(root, resource.stage);
      const bytes = await readAt(root, resource.stage);
      if (bytes === undefined || digest(bytes) !== resource.hash) {
        throw new Error(`Setup staging file changed or incomplete: ${resource.stage}`);
      }
      await publishExclusive(root, resource.stage, resource.file);
      created.push(resource);
    }
    // Bootstrap is last. Cleanup failure after this point must not undo a committed setup.
    committed = true;
    for (const resource of prepared) {
      if ((await readAt(root, resource.stage)) !== undefined) {
        await verifySetupOwnership(root, resource, resource.stage);
        await removeOptional(root, resource.stage);
      }
    }
    await rmdir(directory);
  } catch (error) {
    if (committed) {
      throw new Error(
        `Arch setup committed but staging cleanup failed; inspect ${relative(root, directory)}`,
        { cause: error },
      );
    }
    try {
      for (const resource of created.reverse()) {
        await verifySetupOwnership(root, resource, resource.file);
        await unlink(join(root, resource.file));
      }
    } catch (cleanupError) {
      // Keep the initiating failure authoritative without concealing the cleanup
      // failure. Stop at the same first failed removal and preserve its evidence.
      const detail = String(cleanupError);
      throw new AggregateError(
        [error, cleanupError],
        `Arch setup and rollback cleanup failed: ${detail}`,
        { cause: error },
      );
    }
    throw error;
  }
}
