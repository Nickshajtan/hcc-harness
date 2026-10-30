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
  const pathExtKey = Object.keys(env).find((k) => 'PATHEXT' === k.toUpperCase()) ?? 'PATHEXT';
  let extensions = [''];
  if ('win32' === process.platform && !extname(command)) {
    extensions = (env[pathExtKey] ?? '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .map((ext) => ext.toLowerCase())
      .filter((ext) => ['.exe', '.com', '.cmd', '.bat'].includes(ext));
  }
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = resolve(cwd, dir, command + extension);
      try {
        await access(candidate, 'win32' === process.platform ? constants.F_OK : constants.X_OK);
        if (!(await stat(candidate)).isFile()) {
          continue;
        }
        const native = await realpath(candidate);
        if (await isRouter(dirname(native))) {
          continue;
        }
        return native;
      } catch (error) {
        if (
          !['ENOENT', 'EACCES', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')
        ) {
          throw error;
        }
      }
    }
  }
  throw new Error(`Native executable not found: ${command}`);
}
