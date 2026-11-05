import { fileURLToPath } from 'node:url';
import { readFile, realpath, open } from 'node:fs/promises';
import { join, resolve, delimiter, dirname, basename } from 'node:path';

export const routerMarker = 'arch-harness-router-v1\n';

// Preserve the first matching key and its casing, including duplicate variants.
// Both established process policies use this lookup on every OS.
export function pathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => 'PATH' === key.toUpperCase()) ?? 'PATH';
}

export async function isRouter(directory: string): Promise<boolean> {
  try {
    return (await readFile(join(directory, '.arch-router'), 'utf8')) === routerMarker;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return false;
    }
    throw error;
  }
}

export async function nativeEnvironment(
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<NodeJS.ProcessEnv> {
  const result = { ...env };
  const key = pathKey(result);
  const paths: string[] = [];
  for (const entry of (result[key] ?? '').split(delimiter).filter(Boolean)) {
    if (!(await isRouter(resolve(cwd, entry)))) {
      paths.push(entry);
    }
  }
  result[key] = paths.join(delimiter);
  return result;
}

// Canonical identities and generated launcher signatures are routing safeguards,
// not deletion authority. Arbitrary third-party scripts are not statically provable.
export async function isRouterTarget(file: string, seen = new Set<string>()): Promise<boolean> {
  const target = await realpath(file);
  if (seen.has(target) || (await isRouter(dirname(target)))) {
    return true;
  }
  seen.add(target);
  const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
  if (target === cli) {
    return true;
  }
  const handle = await open(target, 'r');
  const buffer = Buffer.alloc(16384);
  let length: number;
  try {
    length = (await handle.read(buffer, 0, buffer.length, 0)).bytesRead;
  } finally {
    await handle.close();
  }
  const text = buffer.subarray(0, length).toString('utf8');
  // Follow only the generated shell grammar, then verify the referenced identity.
  // A similar-looking third-party launcher targeting a native tool remains valid.
  const shell = /^#!\/bin\/sh\nexec ('[^\n]+') run '[a-zA-Z0-9._-]+' -- "\$@"\n$/.exec(text);
  if (shell?.[1]) {
    const words = shell[1].split("' '");
    const referenced = words.at(-1);
    if (referenced) {
      const path = referenced.replace(/^'|'$/g, '').replaceAll("'\\''", "'");
      if (await isRouterTarget(path, seen)) {
        return true;
      }
    }
  }
  // Scoop launchers carry their generated routing arguments in an adjacent shim.
  if (/\.exe$/i.test(target)) {
    try {
      const shim = await readFile(target.replace(/\.exe$/i, '.shim'), 'utf8');
      const route = /^path = ([^\r\n]+)\nargs = (?:"([^\r\n]+)" )?run [a-zA-Z0-9._-]+ --\n$/.exec(
        shim,
      );
      const referenced = route?.[2] ?? route?.[1];
      if (referenced && (await isRouterTarget(referenced, seen))) {
        return true;
      }
    } catch (error) {
      if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
        throw error;
      }
    }
  }
  // Stable bootstrap aliases resolve beside the installation metadata.
  if (['arch', 'arch.exe'].includes(basename(target))) {
    try {
      const metadata: unknown = JSON.parse(
        await readFile(join(dirname(target), 'installation.json'), 'utf8'),
      );
      return (
        !!metadata &&
        'object' === typeof metadata &&
        'kind' in metadata &&
        'arch-stable-installation-v1' === metadata.kind
      );
    } catch (error) {
      if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
        throw error;
      }
    }
  }
  return false;
}
