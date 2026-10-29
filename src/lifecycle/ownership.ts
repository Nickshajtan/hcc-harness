import { readFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { digest } from './manifest.js';
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
export async function checkFiles(root: string, files: Record<string, string>, recovering = false) {
  // Recorded hashes prove historical ownership; current renderer output and target availability do not.
  // Only an already-persisted uninstall checkpoint permits absent files here.
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
