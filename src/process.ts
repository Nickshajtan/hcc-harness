import { access, realpath, stat, readFile, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, resolve, extname, join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import readCmdShim from 'read-cmd-shim';

export const routerMarker = 'arch-harness-router-v1\n';

async function isRouter(directory: string): Promise<boolean> {
  try { return await readFile(join(directory, '.arch-router'), 'utf8') === routerMarker; }
  catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false; throw error; }
}

export async function nativeEnvironment(env: NodeJS.ProcessEnv, cwd: string): Promise<NodeJS.ProcessEnv> {
  const result = { ...env };
  const key = Object.keys(result).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';
  const paths: string[] = [];
  for (const entry of (result[key] ?? '').split(delimiter).filter(Boolean)) {
    if (!await isRouter(resolve(cwd, entry))) paths.push(entry);
  }
  result[key] = paths.join(delimiter);
  return result;
}

export interface LaunchResult { readonly exitCode: number; readonly signal: NodeJS.Signals | null }

export async function resolveExecutable(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(command)) throw new Error('Expected an executable name without paths');
  const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH');
  const dirs = (env[pathKey ?? 'PATH'] ?? '').split(delimiter).filter(Boolean);
  const pathExtKey = Object.keys(env).find(k => k.toUpperCase() === 'PATHEXT') ?? 'PATHEXT';
  const extensions = process.platform === 'win32'
    ? extname(command) ? [''] : (env[pathExtKey] ?? '.COM;.EXE;.BAT;.CMD').split(';').map(ext => ext.toLowerCase()).filter(ext => ['.exe', '.com', '.cmd', '.bat'].includes(ext))
    : [''];
  for (const dir of dirs) {
    // Project activation normally supplies real tool paths. Do not recurse into mise's dispatcher.
    if (/[/\\](?:command-wrappers[/\\]bin|mise[/\\]shims)$/i.test(dir)) continue;
    for (const extension of extensions) {
      const candidate = resolve(cwd, dir, command + extension);
      try {
        await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        if (!(await stat(candidate)).isFile()) continue;
        const native = await realpath(candidate);
        if (await isRouter(dirname(native))) continue;
        if (/[/\\](?:command-wrappers[/\\]bin|mise[/\\]shims)[/\\]/i.test(native)) continue;
        return native;
      } catch (error) {
        if (!['ENOENT', 'EACCES', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      }
    }
  }
  throw new Error(`Native executable not found: ${command}`);
}

export async function launch(executable: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv,
  signal: AbortSignal): Promise<LaunchResult> {
  let target = executable;
  let nativeArgs = [...args];
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(extname(executable))) {
    if (extname(executable).toLowerCase() !== '.cmd') throw new Error('Arbitrary batch scripts require a shell and are unsupported');
    const destination = await realpath(resolve(dirname(executable), await readCmdShim(executable)));
    if (await isRouter(dirname(destination))) throw new Error('Recursive npm shim target refused');
    if (/\.(exe|com)$/i.test(destination)) target = destination;
    else {
      const handle = await open(destination, 'r');
      const buffer = Buffer.alloc(256);
      try { await handle.read(buffer, 0, buffer.length, 0); } finally { await handle.close(); }
      const shebang = buffer.toString('utf8').split(/\r?\n/)[0] ?? '';
      if (!/^#!\s*(?:\/usr\/bin\/env\s+)?(?:\S*[/\\])?node(?:\.exe)?\s*$/.test(shebang)) throw new Error('npm shim target must be a Node script or native executable');
      target = process.execPath;
      nativeArgs = [destination, ...args];
    }
  }
  signal.throwIfAborted();
  return new Promise((resolveResult, reject) => {
    const child = spawn(target, nativeArgs, { cwd, env, stdio: 'inherit', shell: false });
    let timer: NodeJS.Timeout | undefined;
    const abort = () => {
      const reason = signal.reason;
      const forwarded = ['SIGINT', 'SIGTERM', 'SIGHUP'].includes(reason as string) ? reason as NodeJS.Signals : 'SIGTERM';
      child.kill(process.platform === 'win32' ? 'SIGTERM' : forwarded);
      timer = setTimeout(() => { child.kill('SIGKILL'); }, 3000);
      timer.unref();
    };
    const dispose = () => { signal.removeEventListener('abort', abort); clearTimeout(timer); };
    child.once('error', error => { dispose(); reject(error); });
    child.once('close', (code, nativeSignal) => {
      dispose();
      resolveResult(Object.freeze({ exitCode: code ?? 1, signal: nativeSignal }));
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
