import { mkdir, lstat, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assertSafePath } from './ownership.js';

export const setupClaimPath = '.arch/setup-claim';

// The directory entry is the durable guard, including when its creator dies
// before writing any diagnostic evidence. No claim contents grant ownership.
export async function assertBootstrapAuthority(root: string): Promise<void> {
  await assertSafePath(root, setupClaimPath);
  try {
    await lstat(join(root, setupClaimPath));
  } catch (error) {
    if ('ENOENT' === (error as NodeJS.ErrnoException).code) {
      return;
    }
    throw error;
  }
  throw new Error(
    'Unresolved setup claim: .arch/setup-claim; bootstrap provenance is ambiguous. Preserve bootstrap, managed resources and private stages for inspection; do not retry or remove the claim automatically',
  );
}

export async function claimSetup(root: string) {
  await assertBootstrapAuthority(root);
  await mkdir(join(root, setupClaimPath));
  const identity = await lstat(join(root, setupClaimPath), { bigint: true });
  // Only the invocation holding this directory identity may release its guard,
  // after verified commit/cleanup or verified rollback. A nonempty/substituted
  // guard fails closed; there is no recursive deletion or recovery adoption.
  return async () => {
    await assertSafePath(root, setupClaimPath);
    const current = await lstat(join(root, setupClaimPath), { bigint: true });
    if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino) {
      throw new Error('Setup claim identity changed; preserve for inspection');
    }
    await rmdir(join(root, setupClaimPath));
  };
}
