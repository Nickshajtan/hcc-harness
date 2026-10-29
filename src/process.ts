import { access, realpath, stat, readFile, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, resolve, extname, join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import readCmdShim from 'read-cmd-shim';

export const routerMarker = 'arch-harness-router-v1\n';

async function isRouter(directory: string): Promise<boolean> {
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
  const key = Object.keys(result).find((k) => 'PATH' === k.toUpperCase()) ?? 'PATH';
  const paths: string[] = [];
  for (const entry of (result[key] ?? '').split(delimiter).filter(Boolean)) {
    if (!(await isRouter(resolve(cwd, entry)))) {
      paths.push(entry);
    }
  }
  result[key] = paths.join(delimiter);
  return result;
}

export interface LaunchResult {
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
}

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

export async function launch(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<LaunchResult> {
  signal.throwIfAborted();
  let target = executable;
  let nativeArgs = [...args];
  if ('win32' === process.platform && /\.(cmd|bat)$/i.test(extname(executable))) {
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
  }
  signal.throwIfAborted();
  return new Promise((resolveResult, reject) => {
    const child = spawn(target, nativeArgs, { cwd, env, stdio: 'inherit', shell: false });
    let timer: NodeJS.Timeout | undefined;
    let settled = false,
      cancelled = false;
    const dispose = () => {
      signal.removeEventListener('abort', abort);
      clearTimeout(timer);
      child.off('error', failed);
      child.off('close', closed);
    };
    const failed = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      dispose();
      reject(error);
    };
    const closed = (code: number | null, nativeSignal: NodeJS.Signals | null) => {
      if (settled) {
        return;
      }
      settled = true;
      dispose();
      resolveResult(Object.freeze({ exitCode: code ?? 1, signal: nativeSignal }));
    };
    const abort = () => {
      if (cancelled || settled || null !== child.exitCode || null !== child.signalCode) {
        return;
      }
      cancelled = true;
      const reason: unknown = signal.reason;
      const forwarded = ['SIGINT', 'SIGTERM', 'SIGHUP'].includes(reason as string)
        ? (reason as NodeJS.Signals)
        : 'SIGTERM';
      try {
        child.kill('win32' === process.platform ? 'SIGTERM' : forwarded);
      } catch (error) {
        failed(error as Error);
        return;
      }
      if (settled) {
        return;
      }
      timer = setTimeout(() => {
        if (settled || null !== child.exitCode || null !== child.signalCode) {
          return;
        }
        try {
          child.kill('SIGKILL');
        } catch (error) {
          failed(error as Error);
        }
      }, 3000);
      timer.unref();
    };
    child.once('error', failed);
    child.once('close', closed);
    signal.addEventListener('abort', abort, { once: true });
    if (null !== child.exitCode || null !== child.signalCode) {
      closed(child.exitCode, child.signalCode);
    } else if (signal.aborted) {
      abort();
    }
  });
}
