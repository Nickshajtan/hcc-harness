import { randomUUID } from 'node:crypto';
import { discoverConfiguration } from '../config.js';
import type { EventBus } from '../events.js';
import { ExecutionSession } from './execution-session.js';
import type { Registry, ExecutionContext } from '../middleware.js';
import { nativeEnvironment, type LaunchResult } from '../process.js';
import { demo } from '../demo.js';

export const defaultRegistry: Registry = new Map([['demo', demo]]);
export interface ExecuteOptions {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  registry?: Registry;
  observe?: (bus: EventBus) => void | Promise<void>;
  onSpawn?: () => void;
  reportObserverError?: (error: unknown) => void | Promise<void>;
}

export async function execute(options: ExecuteOptions): Promise<LaunchResult> {
  const env = await nativeEnvironment(options.env ?? process.env, options.cwd);
  const signal = options.signal ?? new AbortController().signal;
  const configuration = await discoverConfiguration(options.cwd);
  const context: ExecutionContext = Object.freeze({
    executionId: randomUUID(),
    parentExecutionId: /^[a-f0-9-]{36}$/i.test(env.ARCH_PARENT_EXECUTION_ID ?? '')
      ? env.ARCH_PARENT_EXECUTION_ID
      : undefined,
    projectRoot: configuration?.projectRoot ?? options.cwd,
    command: options.command,
    originalArgs: Object.freeze([...options.args]),
    cwd: options.cwd,
    signal,
  });
  return new ExecutionSession(
    context,
    configuration ?? { projectRoot: options.cwd, middleware: [] },
    env,
    { defaultRegistry, options },
  ).run();
}
