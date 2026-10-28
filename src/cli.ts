#!/usr/bin/env node
import { constants } from 'node:os';
import { execute } from './core.js';
import { publicCommand, UsageError } from './commands.js';

async function main(): Promise<void> {
  const [operation, command, ...rest] = process.argv.slice(2);
  if (operation !== 'run') { await publicCommand(process.argv.slice(2)); return; }
  if (!command || rest[0] !== '--') {
    throw new Error('Usage: node /path/to/arch/dist/cli.js init [commands...] | uninstall | run <command> -- [args...]');
  }
  const controller = new AbortController();
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', ...(process.platform === 'win32' ? ['SIGBREAK' as const] : [])] as const) {
    const handler = () => { controller.abort(signal); };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  let result;
  try {
    result = await execute({ command, args: rest.slice(1), cwd: process.cwd(), signal: controller.signal,
      observe(bus) {
        if (process.env.ARCH_TRACE === '1') {
          for (const type of ['execution.started', 'middleware.completed', 'execution.completed', 'execution.failed'] as const) {
            bus.subscribe(type, event => { console.error('[arch:event]', JSON.stringify(event)); });
          }
        }
      }
    });
  } catch (error) {
    if (!controller.signal.aborted) throw error;
    process.exitCode = 128 + constants.signals[controller.signal.reason as NodeJS.Signals];
    return;
  } finally { for (const [signal, handler] of handlers) process.off(signal, handler); }
  if (controller.signal.aborted) {
    const signal = controller.signal.reason as NodeJS.Signals;
    process.exitCode = 128 + constants.signals[signal];
  } else if (result.signal) {
    if (process.platform !== 'win32') process.kill(process.pid, result.signal);
    else process.exitCode = 128 + constants.signals[result.signal];
  } else process.exitCode = result.exitCode;
}

main().catch(error => {
  console.error('[arch]', error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.cause instanceof Error) console.error('[arch]', error.cause.message);
  process.exitCode = error instanceof UsageError ? 2 : 1;
});
