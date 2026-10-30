import { access, stat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, extname, resolve, dirname } from 'node:path';
import { isRouter } from './native-environment.js';

export async function resolveExecutable(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(command)) {
    throw new Error('Expected an executable name without paths');
  }
  const pathKey = Object.keys(env).find((k) => 'PATH' === k.toUpperCase());
  const dirs = (env[pathKey ?? 'PATH'] ?? '').split(delimiter).filter(Boolean);
  const extensions = executableExtensions(command, env, process.platform);
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = resolve(cwd, dir, command + extension);
      const native = await readExecutableCandidate(candidate);
      if (native !== undefined) {
        return native;
      }
    }
  }
  throw new Error(`Native executable not found: ${command}`);
}

export function executableExtensions(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  if ('win32' !== platform || extname(command)) {
    return [''];
  }
  const pathExtKey = Object.keys(env).find((key) => 'PATHEXT' === key.toUpperCase()) ?? 'PATHEXT';
  return (env[pathExtKey] ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((extension) => extension.toLowerCase())
    .filter((extension) => ['.exe', '.com', '.cmd', '.bat'].includes(extension));
}

// Resolve identity before router checks so aliases cannot re-enter Arch. Only
// the established lookup-miss errors permit trying the next PATH candidate.
async function readExecutableCandidate(candidate: string): Promise<string | undefined> {
  try {
    await access(candidate, 'win32' === process.platform ? constants.F_OK : constants.X_OK);
    if (!(await stat(candidate)).isFile()) {
      return undefined;
    }
    const native = await realpath(candidate);
    if (await isRouter(dirname(native))) {
      return undefined;
    }
    return native;
  } catch (error) {
    if (!['ENOENT', 'EACCES', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw error;
    }
    return undefined;
  }
}
