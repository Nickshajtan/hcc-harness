import { lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const installationKind = 'arch-stable-installation-v1';

// Only new initialization uses this entry. Recorded historical hashes remain the
// ownership authority; this marker never authorizes rewriting existing routes.
export async function stableEntry(
  root = new URL('../../../', import.meta.url),
): Promise<string | undefined> {
  let bytes: string;
  try {
    bytes = await readFile(new URL('installation.json', root), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && 'ENOENT' === error.code) {
      return undefined;
    }
    throw error;
  }
  const metadata: unknown = JSON.parse(bytes);
  const ready = await lstat(new URL('.arch-ready', root));
  if (
    !ready.isDirectory() ||
    ready.isSymbolicLink() ||
    !metadata ||
    'object' !== typeof metadata ||
    !('kind' in metadata) ||
    installationKind !== metadata.kind ||
    !('platform' in metadata) ||
    metadata.platform !== process.platform
  ) {
    throw new Error('Invalid stable Arch installation marker');
  }
  return fileURLToPath(new URL('win32' === process.platform ? 'arch.exe' : 'arch', root));
}
