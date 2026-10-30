import { spawn } from 'node:child_process';
import { extname } from 'node:path';
import { windowsNpmShim } from './windows-npm-shim.js';
import { ChildExecution, type LaunchResult } from './child-lifecycle.js';

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
    const adapted = await windowsNpmShim(executable, args, cwd, env);
    target = adapted.target;
    nativeArgs = adapted.args;
  }
  signal.throwIfAborted();
  return new Promise((resolveResult, reject) => {
    const child = spawn(target, nativeArgs, { cwd, env, stdio: 'inherit', shell: false });
    new ChildExecution(child, signal, resolveResult, reject).observe();
  });
}
