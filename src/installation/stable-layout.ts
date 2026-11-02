import { lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const installationKind = 'arch-stable-installation-v1';

export function snapshotRoot(packageMetadata: unknown, moduleUrl: URL): URL | undefined {
  if (
    !packageMetadata ||
    'object' !== typeof packageMetadata ||
    !('archStableSnapshot' in packageMetadata)
  ) {
    return undefined;
  }
  if (installationKind !== packageMetadata.archStableSnapshot) {
    throw new Error('Invalid Arch snapshot package marker');
  }
  return new URL('../../../', moduleUrl);
}

// Only new initialization uses this entry. Recorded historical hashes remain the
// ownership authority; this marker never authorizes rewriting existing routes.
export async function stableEntry(root?: URL): Promise<string | undefined> {
  if (undefined === root) {
    const packageMetadata: unknown = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    root = snapshotRoot(packageMetadata, new URL(import.meta.url));
  }
  if (undefined === root) {
    return undefined;
  }
  const bytes = await readFile(new URL('installation.json', root), 'utf8');
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
