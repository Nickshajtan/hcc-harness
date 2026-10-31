import { readFile } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';

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
