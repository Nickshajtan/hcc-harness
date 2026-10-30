import { constants } from 'node:os';
import { execute } from '../core.js';

// Own only CLI signal subscriptions and exit mapping; process policy stays behind Core.
export async function runCommand(command: string, args: readonly string[]): Promise<void> {
  const controller = new AbortController();
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of [
    'SIGINT',
    'SIGTERM',
    'SIGHUP',
    ...('win32' === process.platform ? ['SIGBREAK' as const] : []),
  ] as const) {
    const handler = () => {
      controller.abort(signal);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  let result;
  try {
    result = await execute({
      command,
      args,
      cwd: process.cwd(),
      signal: controller.signal,
      observe(bus) {
        if ('1' === process.env.ARCH_TRACE) {
          for (const type of [
            'execution.started',
            'middleware.completed',
            'execution.completed',
            'execution.failed',
          ] as const) {
            bus.subscribe(type, (event) => {
              console.error('[arch:event]', JSON.stringify(event));
            });
          }
        }
      },
    });
  } catch (error) {
    if (!controller.signal.aborted) {
      throw error;
    }
    process.exitCode = 128 + constants.signals[controller.signal.reason as NodeJS.Signals];
    return;
  } finally {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler);
    }
  }
  if (controller.signal.aborted) {
    const signal = controller.signal.reason as NodeJS.Signals;
    process.exitCode = 128 + constants.signals[signal];
  } else if (result.signal) {
    if ('win32' !== process.platform) {
      process.kill(process.pid, result.signal);
    } else {
      process.exitCode = 128 + constants.signals[result.signal];
    }
  } else {
    process.exitCode = result.exitCode;
  }
}
