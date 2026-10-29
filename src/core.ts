import { randomUUID } from 'node:crypto';
import { discoverConfiguration } from './config.js';
import type { EventBus } from './events.js';
import { ExecutionSession } from './execution-session.js';
import type { Registry, ExecutionContext } from './middleware.js';
import { launch, resolveExecutable, nativeEnvironment, type LaunchResult } from './process.js';
import { demo } from './demo.js';

export const defaultRegistry: Registry = new Map([['demo', demo]]);
export interface ExecuteOptions {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  registry?: Registry;
  observe?: (bus: EventBus) => void | Promise<void>;
  reportObserverError?: (error: unknown) => void | Promise<void>;
}

export async function execute(options: ExecuteOptions): Promise<LaunchResult> {
  const env = await nativeEnvironment(options.env ?? process.env, options.cwd);
  if (env.ARCH_ACTIVE) {
    throw new Error('Recursive Arch invocation refused');
  }
  const signal = options.signal ?? new AbortController().signal;
  const configuration = await discoverConfiguration(options.cwd);
  if (!configuration) {
    const native = await resolveExecutable(options.command, options.cwd, env);
    return launch(native, options.args, options.cwd, { ...env, ARCH_ACTIVE: randomUUID() }, signal);
  }
  const context: ExecutionContext = Object.freeze({
    executionId: randomUUID(),
    projectRoot: configuration.projectRoot,
    command: options.command,
    originalArgs: Object.freeze([...options.args]),
    cwd: options.cwd,
    signal,
  });
  return new ExecutionSession(context, configuration, env, { defaultRegistry, options }).run();
}
