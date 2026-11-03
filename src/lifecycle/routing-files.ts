import { chmod, link, unlink, writeFile, lstat, open } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { assertSafePath, readOptional } from './ownership.js';
import { digest } from './manifest.js';
import { PublicationError, renameNoReplace, nativePublication } from './native-publication.js';
import type { RoutingJournal } from './routing-journal.js';
export async function readAt(root: string, path: string) {
  await assertSafePath(root, path);
  return readOptional(join(root, path));
}
export function staging(journal: RoutingJournal, index: number | 'manifest') {
  return `.arch/.routing-${journal.id}-${String(index)}.stage`;
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

export async function publishExclusive(
  root: string,
  stage: string,
  target: string,
  expectedHash: string,
) {
  for (const path of [stage, target]) {
    if (
      isAbsolute(path) ||
      path
        .split('/')
        .some(
          (part) =>
            !part || '.' === part || '..' === part || part.includes('\\') || part.includes(':'),
        )
    ) {
      throw new Error(`Invalid publication path: ${path}`);
    }
  }
  if (stage === target) {
    throw new Error('Publication stage and target must differ');
  }
  await assertSafePath(root, stage);
  await assertSafePath(root, target);
  const original = await lstat(join(root, stage), { bigint: true });
  const bytes = await readAt(root, stage);
  if (!original.isFile() || bytes === undefined || digest(bytes) !== expectedHash) {
    throw new Error(`Publication stage changed, missing or incomplete: ${stage}`);
  }
  if (nativePublication) {
    // exFAT file IDs can change across directories. Keep an open read handle to
    // the prepared object, then compare its *post-move* ID with the final name.
    // The writer is already closed; libuv permits delete-sharing on this handle.
    const source = await open(join(root, stage), 'r');
    let primaryFailure: unknown;
    try {
      const held = await source.stat({ bigint: true });
      if (
        held.dev !== original.dev ||
        held.ino !== original.ino ||
        digest(await source.readFile()) !== expectedHash
      ) {
        throw new Error(`Publication source identity changed: ${stage}`);
      }
      let failure: unknown;
      try {
        await renameNoReplace(join(root, stage), join(root, target));
      } catch (error) {
        if (!(error instanceof PublicationError) || 'unknown' !== error.outcome) {
          throw error;
        }
        failure = error;
      }
      // An attributable, consumed source is stronger evidence than a helper reply.
      // A same-byte foreign file never qualifies. No rollback/retry on ambiguity.
      try {
        await assertSafePath(root, target);
        const moved = await source.stat({ bigint: true });
        const final = await lstat(join(root, target), { bigint: true });
        if (
          final.isFile() &&
          final.dev === moved.dev &&
          final.ino === moved.ino &&
          digest((await readAt(root, target)) ?? Buffer.alloc(0)) === expectedHash &&
          (await readAt(root, stage)) === undefined
        ) {
          return { dev: final.dev, ino: final.ino };
        }
      } catch (error) {
        failure = failure ?? error;
      }
      throw new PublicationError(
        'unknown',
        `Publication outcome indeterminate for ${target}; preserve setup/journal resources and inspect before retrying`,
        'unknown',
        undefined,
        { cause: failure },
      );
    } catch (error) {
      primaryFailure = error;
      throw error;
    } finally {
      try {
        await source.close();
      } catch (cause) {
        throw new PublicationError(
          'unknown',
          `Publication source handle close failed for ${target}; preserve resources for inspection`,
          'unknown',
          undefined,
          {
            cause:
              primaryFailure === undefined
                ? cause
                : new AggregateError(
                    [primaryFailure, cause],
                    'Publication and source handle cleanup failed',
                    { cause: primaryFailure },
                  ),
          },
        );
      }
    }
  }
  try {
    await link(join(root, stage), join(root, target));
    return { dev: original.dev, ino: original.ino };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown error';
    throw new Error(
      `Unable to publish ${target} exclusively (${code}). Project-local publication requires hard-link support; exFAT does not provide it, and other filesystems or mounts may also lack it. Use a hard-link-capable local filesystem such as NTFS, APFS, or ext4 where supported and configured appropriately. Also check destination collisions and permissions. No fallback was attempted; existing owned files were not overwritten. Preserve any staging/journal files and use status to inspect recovery`,
      { cause: error },
    );
  }
}
