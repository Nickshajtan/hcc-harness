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
  onSpawn?: () => void,
): Promise<LaunchResult> {
  signal.throwIfAborted();
  let target = executable;
  let nativeArgs: string[];
  if ('win32' === process.platform && /\.(cmd|bat)$/i.test(extname(executable))) {
    const adapted = await windowsNpmShim(executable, args, cwd, env);
    target = adapted.target;
    nativeArgs = adapted.args;
  } else {
    nativeArgs = [...args];
  }
  signal.throwIfAborted();
  return new Promise((resolveResult, reject) => {
    const child = spawn(target, nativeArgs, { cwd, env, stdio: 'inherit', shell: false });
    let notificationFailure: Error | undefined;
    try {
      onSpawn?.();
    } catch (error) {
      notificationFailure =
        error instanceof Error ? error : new Error('Spawn notification failed', { cause: error });
    }
    // A caller's notification failure must never orphan an already-spawned child
    // or let Core finalize while it is active. Surface it only after settlement.
    new ChildExecution(
      child,
      signal,
      (result) => {
        if (notificationFailure) {
          reject(notificationFailure);
        } else {
          resolveResult(result);
        }
      },
      reject,
    ).observe();
  });
}
