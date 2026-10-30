import { unlink, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { statePath, uninstallPath, stateFrom, configText } from './manifest.js';
import { readOptional, checkFiles, assertSafePath } from './ownership.js';
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
  const recorded = recovery ?? text;
  if (recorded === undefined) {
    return;
  }
  if (text !== undefined && recovery !== undefined) {
    throw new Error('Conflicting bootstrap and uninstall state; refusing to remove files');
  }
  const state = stateFrom(recorded);
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
