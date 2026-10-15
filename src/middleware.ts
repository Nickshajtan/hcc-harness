import { createHooks } from 'hookable';
import type { EventBus } from './events.js';
import { event } from './events.js';

export interface ExecutionContext {
  readonly executionId: string;
  readonly projectRoot: string;
  readonly command: string;
  readonly originalArgs: readonly string[];
  readonly cwd: string;
  readonly signal: AbortSignal;
}
export type Phase = 'preflight' | 'prepareLaunch' | 'finalize';
export interface MiddlewareAPI {
  readonly context: ExecutionContext;
  on(phase: Phase, handler: () => void | Promise<void>): void;
  setEnv(name: string, value: string): void;
  cleanup(handler: () => void | Promise<void>): void;
}
export interface ArchMiddleware {
  readonly id: string;
  register(api: MiddlewareAPI): void;
}
export type Registry = ReadonlyMap<string, () => ArchMiddleware>;

export function createPipeline(context: ExecutionContext, bus: EventBus) {
  const hooks = createHooks<Record<Phase, () => Promise<void>>>();
  const cleanups: (() => void | Promise<void>)[] = [];
  const env: Record<string, string> = {};
  const envKeys = new Set<string>();
  const finalErrors: unknown[] = [];
  let phase: Phase | undefined;
  let registering = true;
  return {
    register(middleware: ArchMiddleware) {
      if (!registering) throw new Error('Registration has ended');
      middleware.register(Object.freeze({
        context,
        on(name: Phase, handler: () => void | Promise<void>) {
          if (!registering || !['preflight', 'prepareLaunch', 'finalize'].includes(name)) throw new Error('Invalid hook registration');
          hooks.hook(name, async () => {
            try {
              await handler();
              await bus.publish(event('middleware.completed', context.executionId, { middlewareId: middleware.id, phase: name }));
            } catch (error) {
              if (name !== 'finalize') throw error;
              finalErrors.push(error);
            }
          });
        },
        setEnv(name: string, value: string) {
          if (phase !== 'prepareLaunch') throw new Error('Launch changes require prepareLaunch');
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || typeof value !== 'string' || value.includes('\0') ||
              /^(PATH|PATHEXT|ARCH_ACTIVE|NODE_OPTIONS)$/i.test(name)) throw new Error('Invalid or reserved environment variable');
          const key = process.platform === 'win32' ? name.toUpperCase() : name;
          if (envKeys.has(key) && env[key] !== value) throw new Error(`Conflicting launch changes for ${name}`);
          envKeys.add(key);
          env[key] = value;
        },
        cleanup(handler: () => void | Promise<void>) { cleanups.push(handler); }
      }));
    },
    async run(name: Phase) {
      registering = false;
      phase = name;
      try { await hooks.callHook(name); }
      finally { phase = undefined; }
    },
    launchEnv(): Readonly<Record<string, string>> { return Object.freeze({ ...env }); },
    async dispose() {
      for (const cleanup of cleanups.reverse()) {
        try { await cleanup(); } catch (error) { finalErrors.push(error); }
      }
      hooks.removeAllHooks();
      if (finalErrors.length) throw new AggregateError(finalErrors, 'Finalization failed');
    }
  };
}
