import { chmod, link, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertSafePath, readOptional } from './ownership.js';
import type { RoutingJournal } from './routing-journal.js';
export async function readAt(root: string, path: string) {
  await assertSafePath(root, path);
  return readOptional(join(root, path));
}
export function staging(journal: RoutingJournal, index: number | 'manifest') {
  return `.arch/.routing-${journal.id}-${index}.stage`;
}
export async function verifyStage(root: string, path: string, bytes: Buffer) {
  const existing = await readAt(root, path);
  if (existing !== undefined && !existing.equals(bytes)) {
    throw new Error(
      `Routing staging file changed or incomplete: ${path}; preserve it and restore the journal-recorded bytes before retrying`,
    );
  }
}
export async function stage(root: string, path: string, bytes: Buffer, executable = false) {
  await verifyStage(root, path, bytes);
  if ((await readAt(root, path)) === undefined) {
    await writeFile(join(root, path), bytes, { flag: 'wx' });
  }
  if (executable && 'win32' !== process.platform) {
    await chmod(join(root, path), 0o755);
  }
}
export async function removeOptional(root: string, path: string) {
  await assertSafePath(root, path);
  try {
    await unlink(join(root, path));
  } catch (error) {
    if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
      throw new Error(`Unable to remove routing resource: ${path}`, { cause: error });
    }
  }
}

export async function publishExclusive(root: string, stage: string, target: string) {
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
