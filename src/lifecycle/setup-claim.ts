import { projectLayout, type ProjectLayout } from '../project-layout.js';
import { mkdir, lstat, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assertSafePath } from './ownership.js';

export const setupClaimPath = '.arch/setup-claim';

// The directory entry is the durable guard, including when its creator dies
// before writing any diagnostic evidence. No claim contents grant ownership.
export async function assertBootstrapAuthority(
  root: string,
  layout: ProjectLayout = projectLayout(root),
): Promise<void> {
  await assertSafePath(root, layout.setupClaimPath);
  try {
    await lstat(join(root, layout.setupClaimPath));
  } catch (error) {
    if ('ENOENT' === (error as NodeJS.ErrnoException).code) {
      return;
    }
    throw error;
  }
  throw new Error(
    `Unresolved setup claim: ${layout.setupClaimPath}; bootstrap provenance is ambiguous. Preserve bootstrap, managed resources and private stages for inspection; do not retry or remove the claim automatically`,
  );
}

export async function claimSetup(root: string, layout: ProjectLayout = projectLayout(root)) {
  await assertBootstrapAuthority(root, layout);
  await mkdir(join(root, layout.setupClaimPath));
  const identity = await lstat(join(root, layout.setupClaimPath), { bigint: true });
  // Only the invocation holding this directory identity may release its guard,
  // after verified commit/cleanup or verified rollback. A nonempty/substituted
  // guard fails closed; there is no recursive deletion or recovery adoption.
  return async () => {
    await assertSafePath(root, layout.setupClaimPath);
    const current = await lstat(join(root, layout.setupClaimPath), { bigint: true });
    if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino) {
      throw new Error('Setup claim identity changed; preserve for inspection');
    }
    await rmdir(join(root, layout.setupClaimPath));
  };
}
