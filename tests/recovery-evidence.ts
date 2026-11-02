import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertSafePath } from '../src/lifecycle/ownership.js';

// Failure-only, read-only snapshots survive fixture cleanup. Refuse symlinks,
// non-files and oversized payloads; never traverse arbitrary project content.
export async function recoveryEvidence(root: string) {
  return Promise.all(
    ['bootstrap.json', 'uninstall.json', 'routing.json', 'routing.stage'].map(async (name) => {
      try {
        await assertSafePath(root, `.arch/${name}`);
        const path = join(root, '.arch', name);
        const metadata = await lstat(path);
        if (!metadata.isFile() || 1024 * 1024 < metadata.size) {
          return { name, notRead: true, size: metadata.size };
        }
        const bytes = await readFile(path, { signal: AbortSignal.timeout(3000) });
        return {
          name,
          bytes: bytes.length,
          base64: bytes.subarray(0, 1024 * 1024).toString('base64'),
          truncated: 1024 * 1024 < bytes.length,
        };
      } catch (error) {
        return { name, observationError: String(error).slice(0, 4000) };
      }
    }),
  );
}
