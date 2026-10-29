import type { Configuration } from '../config.js';
import { EventBus, event } from '../events.js';
import { createPipeline, type ExecutionContext, type Registry } from '../middleware.js';
import { launch, resolveExecutable, type LaunchResult } from '../process.js';
import { composeLaunchEnvironment } from './execution-environment.js';
import { ExecutionFailures, type ExecutionStage } from './execution-failures.js';

interface SessionOptions {
  registry?: Registry;
  observe?: (bus: EventBus) => void | Promise<void>;
  reportObserverError?: (error: unknown) => void | Promise<void>;
}

// One configured execution owns one bus, pipeline and failure history. No process policy lives here.
export class ExecutionSession {
  private readonly bus: EventBus;
  private readonly pipeline: ReturnType<typeof createPipeline>;
  private readonly failures = new ExecutionFailures();
  private stage: ExecutionStage = 'registration';
  private result: LaunchResult | undefined;

  constructor(
    private readonly context: ExecutionContext,
    private readonly configuration: Configuration,
    private readonly nativeEnv: NodeJS.ProcessEnv,
    private readonly settings: { defaultRegistry: Registry; options: SessionOptions },
  ) {
    this.bus = new EventBus(settings.options.reportObserverError);
    this.pipeline = createPipeline(context, this.bus);
  }

  async run(): Promise<LaunchResult> {
    try {
      await this.start();
      this.registerMiddleware();
      this.result = await this.runNativeLifecycle();
      return this.result;
    } catch (error) {
      // Retain the original failure and stage before finally attempts every remaining phase.
      // Rethrowing also preserves rejection if terminal publication itself fails.
      this.failures.record(error, this.stage);
      throw error;
    } finally {
      await this.finalize();
      await this.publishTerminalEvent();
      // After terminal publication, replace the rethrow with the established ordered aggregate.
      // Publication failures retain their existing precedence and still dispose the bus.
      this.failures.throwIfAny();
    }
  }

  private async start(): Promise<void> {
    try {
      await this.settings.options.observe?.(this.bus);
    } catch (error) {
      // Diagnostics are isolated by EventBus: observers do not decide the native result.
      await this.bus.reportObserverError(error);
    }
    await this.bus.publish(
      event('execution.started', this.context.executionId, {
        command: this.context.command,
        projectRoot: this.context.projectRoot,
      }),
    );
  }

  private registerMiddleware(): void {
    const registry = this.settings.options.registry ?? this.settings.defaultRegistry;
    for (const entry of this.configuration.middleware) {
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
      this.pipeline.register(middleware);
    }
  }

  private async runNativeLifecycle(): Promise<LaunchResult> {
    const { context } = this;
    this.stage = 'resolution';
    const native = await resolveExecutable(context.command, context.cwd, this.nativeEnv);
    this.stage = 'preflight';
    context.signal.throwIfAborted();
    await this.pipeline.run('preflight');
    this.stage = 'prepareLaunch';
    await this.pipeline.run('prepareLaunch');
    this.stage = 'launch';
    const env = composeLaunchEnvironment(
      this.nativeEnv,
      this.pipeline.launchEnv(),
      context.executionId,
    );
    return launch(native, context.originalArgs, context.cwd, env, context.signal);
  }

  private async finalize(): Promise<void> {
    // Disposal must run even when hook dispatch fails; it owns reverse-order cleanup.
    try {
      await this.pipeline.run('finalize');
    } catch (error) {
      this.failures.record(error, 'finalize');
    }
    try {
      await this.pipeline.dispose();
    } catch (error) {
      this.failures.record(error, 'finalize');
    }
  }

  private async publishTerminalEvent(): Promise<void> {
    // Completion means finalization and cleanup have both been attempted.
    try {
      if (this.failures.hasFailures) {
        await this.bus.publish(
          event('execution.failed', this.context.executionId, { stage: this.failures.stage }),
        );
      } else if (this.result) {
        await this.bus.publish(event('execution.completed', this.context.executionId, this.result));
      }
    } finally {
      this.bus.dispose();
    }
  }
}
