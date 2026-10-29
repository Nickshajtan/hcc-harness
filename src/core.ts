import { randomUUID } from 'node:crypto';
import { discoverConfiguration } from './config.js';
import { EventBus, event } from './events.js';
import { createPipeline, type Registry, type ExecutionContext } from './middleware.js';
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
  const bus = new EventBus(options.reportObserverError);
  const pipeline = createPipeline(context, bus);
  let result: LaunchResult | undefined;
  let stage = 'registration';
  const errors: unknown[] = [];
  try {
    try {
      await options.observe?.(bus);
    } catch (error) {
      await bus.reportObserverError(error);
    }
    await bus.publish(
      event('execution.started', context.executionId, {
        command: context.command,
        projectRoot: context.projectRoot,
      }),
    );
    const registry = options.registry ?? defaultRegistry;
    for (const entry of configuration.middleware) {
      if (!entry.enabled) {
        continue;
      }
      const factory = registry.get(entry.id);
      if (!factory) {
        throw new Error(`Unknown middleware: ${entry.id}`);
      }
      const middleware = factory();
      if (middleware.id !== entry.id) {
        throw new Error(`Middleware registration id mismatch: ${entry.id}`);
      }
      pipeline.register(middleware);
    }
    stage = 'resolution';
    const native = await resolveExecutable(context.command, context.cwd, env);
    stage = 'preflight';
    signal.throwIfAborted();
    await pipeline.run('preflight');
    stage = 'prepareLaunch';
    await pipeline.run('prepareLaunch');
    stage = 'launch';
    const changes = pipeline.launchEnv();
    if ('win32' === process.platform) {
      for (const key of Object.keys(env)) {
        if (Object.keys(changes).some((name) => name.toUpperCase() === key.toUpperCase())) {
          delete env[key];
        }
      }
    }
    result = await launch(
      native,
      context.originalArgs,
      context.cwd,
      { ...env, ...changes, ARCH_ACTIVE: context.executionId },
      signal,
    );
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      await pipeline.run('finalize');
    } catch (error) {
      if (!errors.length) {
        stage = 'finalize';
      }
      errors.push(error);
    }
    try {
      await pipeline.dispose();
    } catch (error) {
      if (!errors.length) {
        stage = 'finalize';
      }
      errors.push(error);
    }
    try {
      if (errors.length) {
        await bus.publish(event('execution.failed', context.executionId, { stage }));
      } else if (result) {
        await bus.publish(event('execution.completed', context.executionId, result));
      }
    } finally {
      bus.dispose();
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, `Arch execution failed during ${stage}`, { cause: errors[0] });
  }
  return result!;
}
