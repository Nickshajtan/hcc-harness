import { access, realpath, stat, readFile, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, extname, join, dirname } from 'node:path';
import readCmdShim from 'read-cmd-shim';
import { isRouter } from './native-environment.js';
import { resolveExecutable } from './executable-resolver.js';

export async function windowsNpmShim(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ target: string; args: string[] }> {
  let target = executable;
  let nativeArgs = [...args];
  if ('.cmd' !== extname(executable).toLowerCase()) {
    throw new Error('Arbitrary batch scripts require a shell and are unsupported');
  }
  const destination = await realpath(resolve(dirname(executable), await readCmdShim(executable)));
  if (await isRouter(dirname(destination))) {
    throw new Error('Recursive npm shim target refused');
  }
  if (/\.(exe|com)$/i.test(destination)) {
    target = destination;
  } else {
    const handle = await open(destination, 'r');
    const buffer = Buffer.alloc(256);
    try {
      await handle.read(buffer, 0, buffer.length, 0);
    } finally {
      await handle.close();
    }
    const shebang = buffer.toString('utf8').split(/\r?\n/)[0] ?? '';
    if (!/^#!\s*(?:\/usr\/bin\/env\s+)?(?:\S*[/\\])?node(?:\.exe)?\s*$/.test(shebang)) {
      throw new Error('npm shim target must be a Node script or native executable');
    }
    // npm's standard Node shim prefers its adjacent node.exe; simple Node
    // shims use PATH. Neither may inherit Arch's independently chosen Node.
    const shimText = await readFile(executable, 'utf8');
    const adjacent = join(dirname(executable), 'node.exe');
    const prefersAdjacent = /IF EXIST "%(?:dp0%|~dp0)\\node\.exe"\s*\(/i.test(shimText);
    let adjacentExists = false;
    if (prefersAdjacent) {
      try {
        await access(adjacent, constants.F_OK);
        adjacentExists = true;
      } catch (error) {
        if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
          throw error;
        }
      }
    }
    if (adjacentExists) {
      target = await realpath(adjacent);
      if (!(await stat(target)).isFile() || (await isRouter(dirname(target)))) {
        throw new Error('Recursive or invalid adjacent npm Node runtime refused');
      }
    } else {
      try {
        target = await resolveExecutable('node.exe', cwd, env);
      } catch (error) {
        throw new Error(
          "Native npm CLI requires node.exe on its own PATH (or the standard shim's adjacent node.exe); Arch's runtime and ARCH_NODE are not native runtime fallbacks",
          { cause: error },
        );
      }
    }
    nativeArgs = [destination, ...args];
  }

  return { target, args: nativeArgs };
}
