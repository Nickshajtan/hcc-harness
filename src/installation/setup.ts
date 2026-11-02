import { mkdir, writeFile, unlink, chmod } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
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

import { renderFiles } from './renderer.js';

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
    try {
      for (const file of created.reverse()) {
        await unlink(file);
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
