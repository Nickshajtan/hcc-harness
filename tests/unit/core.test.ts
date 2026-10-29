import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { execute } from '../../src/core.js';
import {
  createPipeline,
  type Registry,
  type ArchMiddleware,
  type ExecutionContext,
} from '../../src/middleware.js';
import { EventBus, type ArchEvent } from '../../src/events.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'arch-core-'));
  await mkdir(join(root, '.arch'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it('preserves launch cancellation as primary ahead of reverse-order cleanup failures', async () => {
  await configure(['local']);
  const controller = new AbortController();
  const primary = new Error('cancel during preparation');
  const first = new Error('first cleanup');
  const second = new Error('second cleanup');
  const calls: string[] = [];
  const stages: string[] = [];
  const failure: unknown = await execute({
    ...launchOptions(),
    signal: controller.signal,
    registry: new Map([
      [
        'local',
        () => ({
          id: 'local',
          register(api) {
            expect(api.context.signal).toBe(controller.signal);
            api.on('prepareLaunch', () => controller.abort(primary));
            api.on('finalize', () => {
              calls.push('finalize');
            });
            api.cleanup(() => {
              calls.push('first');
              throw first;
            });
            api.cleanup(() => {
              calls.push('second');
              throw second;
            });
          },
        }),
      ],
    ]),
    observe(bus) {
      bus.subscribe('execution.failed', (value) => {
        stages.push(value.payload.stage);
      });
    },
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) {
    throw new Error('Expected execution failure');
  }
  expect(failure.message).toBe('Arch execution failed during launch');
  expect(failure.cause).toBe(primary);
  expect(failure.errors[0]).toBe(primary);
  const secondary: unknown = failure.errors[1];
  expect(secondary).toBeInstanceOf(AggregateError);
  if (!(secondary instanceof AggregateError)) {
    throw new Error('Expected cleanup failure');
  }
  expect(secondary.errors).toEqual([second, first]);
  expect(calls).toEqual(['finalize', 'second', 'first']);
  expect(stages).toEqual(['launch']);
});

it('disposes listeners when terminal infrastructure publication fails', async () => {
  await configure([]);
  const primary = new Error('terminal infrastructure failed');
  const publish = EventBus.prototype.publish;
  vi.spyOn(EventBus.prototype, 'publish').mockImplementation(function (this: EventBus, value) {
    if ('execution.completed' === value.type) {
      return Promise.reject(primary);
    }
    return publish.call(this, value);
  });
  let captured: EventBus | undefined;
  await expect(
    execute({
      ...launchOptions(),
      observe(bus) {
        captured = bus;
        bus.subscribe('execution.completed', () => undefined);
      },
    }),
  ).rejects.toBe(primary);
  expect(captured?.listenerCount).toBe(0);
});

it('composes native casing and empty overrides without mutating incoming environment', async () => {
  await configure(['local']);
  const output = join(root, 'environment');
  const env = { ...launchOptions().env, Mixed: 'incoming', UNTOUCHED: 'kept' };
  const registry: Registry = new Map([
    [
      'local',
      () => ({
        id: 'local',
        register(api) {
          api.on('prepareLaunch', () => {
            api.setEnv('mixed', '');
          });
        },
      }),
    ],
  ]);
  await execute({
    ...launchOptions(),
    env,
    registry,
    args: [
      '-e',
      `require('fs').writeFileSync(${JSON.stringify(output)},JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(mixed|untouched)$/i.test(key)))))`,
    ],
  });
  const nativeEnvironment: unknown = JSON.parse(await readFile(output, 'utf8'));
  expect(nativeEnvironment).toEqual(
    'win32' === process.platform
      ? { UNTOUCHED: 'kept', MIXED: '' }
      : { Mixed: 'incoming', UNTOUCHED: 'kept', mixed: '' },
  );
  expect(env).toEqual({ ...launchOptions().env, Mixed: 'incoming', UNTOUCHED: 'kept' });
});
const context = (): ExecutionContext =>
  Object.freeze({
    executionId: 'id',
    projectRoot: root,
    command: 'tool',
    originalArgs: Object.freeze(['arg']),
    cwd: root,
    signal: new AbortController().signal,
  });
async function configure(ids: string[]) {
  await writeFile(
    join(root, '.arch/harness.toml'),
    'schema=1\n' + ids.map((id) => `[[middleware]]\nid="${id}"\nenabled=true\n`).join(''),
  );
}
const launchOptions = () => ({
  command: basename(process.execPath),
  args: ['-e', 'process.exit(7)'],
  cwd: root,
  env: { PATH: dirname(process.execPath), SystemRoot: process.env.SystemRoot ?? '' },
});

it('uses configuration order, immutable identity, fresh middleware, lifecycle events and cleanup', async () => {
  await configure(['second', 'first']);
  const calls: string[] = [],
    received: ArchEvent[] = [],
    contexts: ExecutionContext[] = [];
  const registry: Registry = new Map(
    ['first', 'second'].map((id) => [
      id,
      (): ArchMiddleware => ({
        id,
        register(api) {
          contexts.push(api.context);
          expect(Object.isFrozen(api.context)).toBe(true);
          expect(Object.isFrozen(api.context.originalArgs)).toBe(true);
          api.on('preflight', () => {
            calls.push(id + ':pre');
          });
          api.on('prepareLaunch', () => {
            api.setEnv('CUSTOM', 'same');
            calls.push(id + ':prepare');
          });
          api.on('finalize', () => {
            calls.push(id + ':final');
          });
          api.cleanup(() => {
            calls.push(id + ':cleanup');
          });
        },
      }),
    ]),
  );
  let bus: EventBus | undefined;
  const result = await execute({
    ...launchOptions(),
    registry,
    observe(value) {
      bus = value;
      for (const type of [
        'execution.started',
        'middleware.completed',
        'execution.completed',
        'execution.failed',
      ] as const) {
        value.subscribe(type, (e) => {
          received.push(e);
        });
      }
    },
  });
  expect(result.exitCode).toBe(7);
  expect(calls).toEqual([
    'second:pre',
    'first:pre',
    'second:prepare',
    'first:prepare',
    'second:final',
    'first:final',
    'first:cleanup',
    'second:cleanup',
  ]);
  expect(contexts[0]).toBe(contexts[1]);
  expect(new Set(received.map((e) => e.executionId)).size).toBe(1);
  expect(received.map((e) => e.type)).toEqual([
    'execution.started',
    ...Array.from({ length: 6 }, () => 'middleware.completed'),
    'execution.completed',
  ]);
  expect(bus?.listenerCount).toBe(0);
  expect(received[0]?.payload).toEqual({ command: basename(process.execPath), projectRoot: root });
  expect(
    received.filter((value) => 'middleware.completed' === value.type).map((value) => value.payload),
  ).toEqual(
    ['preflight', 'prepareLaunch', 'finalize'].flatMap((phase) =>
      ['second', 'first'].map((middlewareId) => ({ middlewareId, phase })),
    ),
  );
});

it('skips disabled unknown middleware and supports an omitted observer', async () => {
  await writeFile(
    join(root, '.arch/harness.toml'),
    'schema=1\n[[middleware]]\nid="unknown"\nenabled=false\n',
  );
  const diagnostics: unknown[] = [];
  expect(
    (
      await execute({
        ...launchOptions(),
        reportObserverError(error) {
          diagnostics.push(error);
        },
      })
    ).exitCode,
  ).toBe(7);
  expect(diagnostics).toEqual([]);
});

it('uses the default registry and preserves native environment case semantics', async () => {
  await configure(['demo']);
  const file = join(root, 'native-env.json');
  const env = { ...launchOptions().env, ARCH_DEMO: 'incoming' };
  const result = await execute({
    ...launchOptions(),
    env,
    args: ['-e', `require('fs').writeFileSync(${JSON.stringify(file)},process.env.ARCH_DEMO)`],
  });
  expect(result.exitCode).toBe(0);
  expect(await readFile(file, 'utf8')).toBe('1');
  expect(env.ARCH_DEMO).toBe('incoming');
});

it('denial prevents launch and observer failures cannot reverse it; all finalizers and cleanup run', async () => {
  await configure(['deny', 'other']);
  const calls: string[] = [],
    received: string[] = [];
  const registry: Registry = new Map(
    ['deny', 'other'].map((id) => [
      id,
      () => ({
        id,
        register(api) {
          api.on('preflight', () => {
            if ('deny' === id) {
              throw new Error('denied');
            }
          });
          api.on('finalize', () => {
            calls.push(id);
            if ('deny' === id) {
              throw new Error('finalizer failed');
            }
          });
          api.cleanup(() => {
            calls.push(id + ':cleanup');
            if ('other' === id) {
              throw new Error('cleanup failed');
            }
          });
        },
      }),
    ]),
  );
  const file = join(root, 'launched');
  await expect(
    execute({
      ...launchOptions(),
      args: ['-e', `require('fs').writeFileSync(${JSON.stringify(file)}, '')`],
      registry,
      reportObserverError: () => {},
      observe(bus) {
        bus.subscribe('execution.started', () => {
          throw new Error('observer failed');
        });
        bus.subscribe('execution.failed', (e) => {
          received.push(e.type);
        });
      },
    }),
  ).rejects.toThrow('preflight');
  await expect(readFile(file)).rejects.toThrow();
  expect(calls).toEqual(['deny', 'other', 'other:cleanup', 'deny:cleanup']);
  expect(received).toEqual(['execution.failed']);
});

it('cleans partially registered middleware and rejects unknown/mismatched module ids', async () => {
  await configure(['broken']);
  let cleaned = false;
  await expect(
    execute({
      ...launchOptions(),
      registry: new Map([
        [
          'broken',
          () => ({
            id: 'broken',
            register(api) {
              api.cleanup(() => {
                cleaned = true;
              });
              throw new Error('registration failed');
            },
          }),
        ],
      ]),
    }),
  ).rejects.toThrow('registration');
  expect(cleaned).toBe(true);
  await expect(execute({ ...launchOptions(), registry: new Map() })).rejects.toMatchObject({
    cause: new Error('Unknown middleware: broken'),
  });
  await expect(
    execute({
      ...launchOptions(),
      registry: new Map([['broken', () => ({ id: 'different', register() {} })]]),
    }),
  ).rejects.toMatchObject({ cause: new Error('Middleware registration id mismatch: broken') });
});

it('validates launch changes and conflicts without allowing late hook registration', async () => {
  const pipeline = createPipeline(context(), new EventBus());
  pipeline.register({
    id: 'one',
    register(api) {
      expect(() => {
        api.setEnv('FOO', 'bar');
      }).toThrow();
      api.on('prepareLaunch', () => {
        expect(() => {
          api.setEnv('PATH', 'override');
        }).toThrow();
        expect(() => {
          api.setEnv('BAD=KEY', 'value');
        }).toThrow();
        expect(() => {
          api.setEnv('VALUE', '\0');
        }).toThrow();
        expect(() => {
          api.on('preflight', () => {});
        }).toThrow();
        api.setEnv('FOO', 'one');
      });
    },
  });
  pipeline.register({
    id: 'two',
    register(api) {
      api.on('prepareLaunch', () => {
        api.setEnv('FOO', 'two');
      });
    },
  });
  await expect(pipeline.run('prepareLaunch')).rejects.toThrow('Conflicting');
  await pipeline.run('finalize');
  await pipeline.dispose();
});

it('keeps concurrent contexts, mutable launch changes, events and cleanup isolated', async () => {
  await configure(['local']);
  const contexts: ExecutionContext[] = [],
    cleaned: string[] = [];
  const registry: Registry = new Map([
    [
      'local',
      () => ({
        id: 'local',
        register(api) {
          contexts.push(api.context);
          api.on('prepareLaunch', async () => {
            await Promise.resolve();
            api.setEnv('ISOLATED_ID', api.context.executionId);
          });
          api.cleanup(() => {
            cleaned.push(api.context.executionId);
          });
        },
      }),
    ],
  ]);
  const sets: ArchEvent[][] = [[], []];
  await Promise.all(
    sets.map(async (received, index) => {
      const file = join(root, `${index}.json`);
      await execute({
        ...launchOptions(),
        registry,
        args: [
          '-e',
          `require('fs').writeFileSync(${JSON.stringify(file)}, process.env.ISOLATED_ID)`,
        ],
        observe(bus) {
          bus.subscribe('execution.started', (e) => {
            received.push(e);
          });
        },
      });
      expect(await readFile(file, 'utf8')).toBe(received[0]?.executionId);
    }),
  );
  expect(new Set(contexts.map((c) => c.executionId)).size).toBe(2);
  expect(new Set(cleaned)).toEqual(new Set(contexts.map((c) => c.executionId)));
});

it('rejects recursive invocations and aborted launches', async () => {
  await configure([]);
  await expect(execute({ ...launchOptions(), env: { ARCH_ACTIVE: 'existing' } })).rejects.toThrow(
    'Recursive',
  );
  await expect(
    execute({ ...launchOptions(), signal: AbortSignal.abort('SIGTERM') }),
  ).rejects.toThrow();
});

it('cancels before preflight while still finalizing and cleaning exactly once', async () => {
  await configure(['local']);
  const calls: string[] = [];
  const reason = new Error('cancel before launch');
  const registry: Registry = new Map([
    [
      'local',
      () => ({
        id: 'local',
        register(api) {
          api.on('preflight', () => {
            calls.push('preflight');
          });
          api.on('prepareLaunch', () => {
            calls.push('prepareLaunch');
          });
          api.on('finalize', () => {
            calls.push('finalize');
          });
          api.cleanup(() => {
            calls.push('cleanup');
          });
        },
      }),
    ],
  ]);
  await expect(
    execute({ ...launchOptions(), registry, signal: AbortSignal.abort(reason) }),
  ).rejects.toMatchObject({ message: 'Arch execution failed during preflight', cause: reason });
  expect(calls).toEqual(['finalize', 'cleanup']);
});

it('passes through without configuration, retaining recursion protection and no event envelope', async () => {
  const file = join(root, 'passthrough-guard');
  const received: ArchEvent[] = [];
  const result = await execute({
    ...launchOptions(),
    args: [
      '-e',
      `require('fs').writeFileSync(${JSON.stringify(file)},process.env.ARCH_ACTIVE);process.exit(23)`,
    ],
    observe(bus) {
      bus.subscribe('execution.started', (value) => {
        received.push(value);
      });
    },
  });
  expect(result).toEqual({ exitCode: 23, signal: null });
  expect(await readFile(file, 'utf8')).toMatch(/^[a-f0-9-]{36}$/);
  expect(received).toEqual([]);
});

it('reports observer initialization errors by identity and continues native execution', async () => {
  await configure([]);
  const error = new Error('observer setup failed'),
    received: unknown[] = [];
  const result = await execute({
    ...launchOptions(),
    observe() {
      throw error;
    },
    reportObserverError(value) {
      received.push(value);
    },
  });
  expect(result.exitCode).toBe(7);
  expect(received).toEqual([error]);
});

it('contains observer diagnostic errors while preserving middleware denial and listener disposal', async () => {
  await configure(['deny']);
  const error = new Error('observer setup failed'),
    received: unknown[] = [];
  let bus: EventBus | undefined;
  const registry: Registry = new Map([
    [
      'deny',
      () => ({
        id: 'deny',
        register(api) {
          api.on('preflight', () => {
            throw new Error('denied');
          });
        },
      }),
    ],
  ]);
  await expect(
    execute({
      ...launchOptions(),
      registry,
      observe(value) {
        bus = value;
        value.subscribe('execution.started', () => {});
        throw error;
      },
      reportObserverError(value) {
        received.push(value);
        throw new Error('reporter failed');
      },
    }),
  ).rejects.toThrow('preflight');
  expect(received).toEqual([error]);
  expect(bus?.listenerCount).toBe(0);
  await configure([]);
  expect(
    (
      await execute({
        ...launchOptions(),
        observe() {
          throw error;
        },
        reportObserverError() {
          throw error;
        },
      })
    ).exitCode,
  ).toBe(7);
});

it('contains rejected observer and reporter promises without unhandled rejections', async () => {
  await configure([]);
  const error = new Error('async observer error'),
    received: unknown[] = [];
  const result = await execute({
    ...launchOptions(),
    async observe() {
      await Promise.resolve();
      throw error;
    },
    async reportObserverError(value) {
      received.push(value);
      await Promise.resolve();
      throw new Error('async reporter error');
    },
  });
  expect(result.exitCode).toBe(7);
  expect(received).toEqual([error]);
});

it.each(['resolution', 'preflight', 'prepareLaunch', 'finalize'])(
  'preserves the primary %s failure and ordered finalization failures',
  async (failureStage) => {
    await configure(['local']);
    const primary = new Error('primary');
    const finalizer = new Error('finalizer');
    const cleanup = new Error('cleanup');
    const calls: string[] = [];
    const stages: string[] = [];
    const registry: Registry = new Map([
      [
        'local',
        () => ({
          id: 'local',
          register(api) {
            api.on('preflight', () => {
              calls.push('preflight');
              if ('preflight' === failureStage) {
                throw primary;
              }
            });
            api.on('prepareLaunch', () => {
              calls.push('prepareLaunch');
              if ('prepareLaunch' === failureStage) {
                throw primary;
              }
            });
            api.on('finalize', () => {
              calls.push('finalize');
              throw finalizer;
            });
            api.cleanup(() => {
              calls.push('cleanup');
              throw cleanup;
            });
          },
        }),
      ],
    ]);
    const failure: unknown = await execute({
      ...launchOptions(),
      command:
        'resolution' === failureStage ? 'missing-native-arch-test' : basename(process.execPath),
      registry,
      observe(bus) {
        bus.subscribe('execution.failed', (value) => {
          stages.push(value.payload.stage);
          expect(calls.at(-1)).toBe('cleanup');
        });
      },
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) {
      throw new Error('Expected aggregated execution failure');
    }
    expect(stages).toEqual([failureStage]);
    expect(calls.filter((call) => 'finalize' === call)).toHaveLength(1);
    expect(calls.filter((call) => 'cleanup' === call)).toHaveLength(1);
    const errors: unknown[] = failure.errors;
    const finalization = errors.at(-1);
    expect(finalization).toBeInstanceOf(AggregateError);
    if (!(finalization instanceof AggregateError)) {
      throw new Error('Expected ordered finalization failures');
    }
    expect(finalization.errors).toEqual([finalizer, cleanup]);
    expect(finalization.message).toBe('Finalization failed');
    if ('finalize' === failureStage) {
      expect(errors).toEqual([finalization]);
      expect(failure.cause).toBe(finalization);
    } else {
      expect(errors).toHaveLength(2);
      expect(failure.cause).toBe(errors[0]);
      if ('resolution' === failureStage) {
        expect(errors[0]).toEqual(
          new Error('Native executable not found: missing-native-arch-test'),
        );
        expect(calls).toEqual(['finalize', 'cleanup']);
      } else {
        expect(errors[0]).toBe(primary);
      }
    }
  },
);
