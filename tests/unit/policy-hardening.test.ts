import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  dispatchPolicy,
  type PolicyAPI,
  type PolicyDecision,
  type PolicyDispatchOptions,
  type PolicyResult,
} from '../../src/policy.js';
import type { ArchMiddleware, Registry } from '../../src/middleware.js';

const request = { type: 'agent.beforeSpawn', requestId: 'request', provider: 'mock' };
const configuration = (...ids: string[]) => ({
  middleware: ids.map((id) => ({ id, enabled: true })),
});
const required = { requiredPolicies: ['required'], timeoutMs: 20, cleanupGraceMs: 10 };
const allow = (): PolicyDecision => ({ action: 'allow' });
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (cause: Error) => void = () => undefined;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function middleware(id: string, registerPolicy: (api: PolicyAPI) => unknown): ArchMiddleware {
  return {
    id,
    register: () => {
      throw new Error('Process registration is forbidden');
    },
    registerPolicy,
  };
}
function registry(...modules: ArchMiddleware[]): Registry {
  return new Map(modules.map((module) => [module.id, () => module]));
}
function policy(register: (api: PolicyAPI) => unknown, options: PolicyDispatchOptions = required) {
  return dispatchPolicy(
    request,
    configuration('required'),
    registry(middleware('required', register)),
    options,
  );
}
function failure(result: PolicyResult) {
  expect(result.outcome).toBe('policy-error');
  if ('invalid-request' === result.outcome) {
    throw new Error('Expected a correlated failure');
  }
  expect(result.failures.length).toBeGreaterThan(0);
  return result;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it('accepts ordinary synchronous registration and a required allow handler', async () => {
  const result = await policy((api) => {
    api.on('agent.beforeSpawn', allow);
  });
  expect(result).toMatchObject({ outcome: 'allow', failures: [] });
});

it('rejects suspended async registration, cleans partial resources and contains late API errors', async () => {
  const gate = deferred<undefined>();
  const cleanup = vi.fn(),
    handler = vi.fn(allow);
  let captured: PolicyAPI | undefined;
  const result = failure(
    await policy(async (api) => {
      captured = api;
      api.cleanup(cleanup);
      await gate.promise;
      api.on('agent.beforeSpawn', handler);
    }),
  );
  expect(result.failures).toMatchObject([
    { code: 'registration-contract', stage: 'registration', middlewareId: 'required' },
  ]);
  expect(cleanup).toHaveBeenCalledTimes(1);
  gate.resolve(undefined);
  await vi.advanceTimersByTimeAsync(0);
  expect(handler).not.toHaveBeenCalled();
  expect(() => {
    captured!.cleanup(() => undefined);
  }).toThrow('ended');
  expect(result.outcome).toBe('policy-error');
});

it('contains an already rejected async registration without invoking previously registered handlers', async () => {
  const handler = vi.fn(allow),
    cleanup = vi.fn();
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    const result = failure(
      await policy((api) => {
        api.cleanup(cleanup);
        api.on('agent.beforeSpawn', handler);
        return Promise.reject(new Error('registration rejected'));
      }),
    );
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(result.failures[0]).toMatchObject({
      code: 'registration-contract',
      stage: 'registration',
      middlewareId: 'required',
    });
    expect(unhandled).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  } finally {
    process.off('unhandledRejection', unhandled);
  }
});

it('rejects thenables without reading or invoking their potentially hostile then property', async () => {
  const then = vi.fn(() => {
    throw new Error('must not run');
  });
  const getter = vi.fn(() => {
    throw new Error('must not read');
  });
  for (const returned of [
    { then },
    Object.defineProperty({}, 'then', { get: getter }),
    { then: () => new Promise(() => undefined) },
  ]) {
    expect(failure(await policy(() => returned)).failures[0]).toMatchObject({
      code: 'registration-contract',
      stage: 'registration',
      middlewareId: 'required',
    });
  }
  expect(then).not.toHaveBeenCalled();
  expect(getter).not.toHaveBeenCalled();
});

it('observes a genuine rejected Promise without invoking overridden then or catch methods', async () => {
  const getter = vi.fn(() => {
    throw new Error('must not inspect then');
  });
  const returned = Promise.reject(new Error('registration'));
  void Object.defineProperty(returned, 'then', { get: getter });
  void Object.defineProperty(returned, 'catch', { get: getter });
  expect(failure(await policy(() => returned)).failures[0]).toMatchObject({
    code: 'registration-contract',
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(getter).not.toHaveBeenCalled();
});

it.each([null, true, 0, 'unexpected', {}, Promise.resolve(undefined)])(
  'rejects non-undefined registration return %#',
  async (returned) => {
    const handler = vi.fn(allow);
    const result = failure(
      await policy((api) => {
        api.on('agent.beforeSpawn', handler);
        return returned;
      }),
    );
    expect(result.failures[0]).toMatchObject({
      stage: 'registration',
      code: 'registration-contract',
      middlewareId: 'required',
    });
    expect(handler).not.toHaveBeenCalled();
  },
);

it('preserves a synchronous registration exception and reverse cleanup failures', async () => {
  const primary = new Error('register'),
    secondary = new Error('cleanup');
  const cleanup = vi.fn(() => {
    throw secondary;
  });
  const result = failure(
    await policy((api) => {
      api.cleanup(cleanup);
      throw primary;
    }),
  );
  expect(result.failures).toEqual([
    { stage: 'registration', code: 'exception', middlewareId: 'required', cause: primary },
    { stage: 'cleanup', code: 'exception', middlewareId: 'required', cause: secondary },
  ]);
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('allows an empty optional configuration but fails closed for a missing required module', async () => {
  expect(await dispatchPolicy(request, configuration(), new Map())).toMatchObject({
    outcome: 'allow',
  });
  const result = failure(await dispatchPolicy(request, configuration(), new Map(), required));
  expect(result.failures[0]).toMatchObject({
    stage: 'configuration',
    code: 'configuration-error',
    middlewareId: 'required',
  });
});

it('rejects a required module missing from the registry or disabled in configuration', async () => {
  const factory = vi.fn(() => middleware('required', () => undefined));
  for (const [config, modules] of [
    [configuration('required'), new Map()],
    [{ middleware: [{ id: 'required', enabled: false }] }, new Map([['required', factory]])],
  ] as const) {
    expect(
      failure(await dispatchPolicy(request, config, modules, required)).failures[0],
    ).toMatchObject({
      code: 'configuration-error',
      stage: 'configuration',
      middlewareId: 'required',
    });
  }
  expect(factory).not.toHaveBeenCalled();
});

it('requires an applicable handler, not just a configured instance or registerPolicy method', async () => {
  for (const module of [
    { id: 'required', register: () => undefined },
    middleware('required', () => undefined),
  ]) {
    const result = failure(
      await dispatchPolicy(request, configuration('required'), registry(module), required),
    );
    expect(result.failures[0]).toMatchObject({
      code: 'configuration-error',
      stage: 'registration',
      middlewareId: 'required',
    });
  }
});

it('rejects incorrect instance identity before any handler can authorize', async () => {
  const handler = vi.fn(allow);
  const result = failure(
    await dispatchPolicy(
      request,
      configuration('required'),
      new Map([
        [
          'required',
          () =>
            middleware('wrong', (api) => {
              api.on('agent.beforeSpawn', handler);
            }),
        ],
      ]),
      required,
    ),
  );
  expect(result.failures[0]).toMatchObject({
    code: 'configuration-error',
    stage: 'registration',
    middlewareId: 'required',
  });
  expect(handler).not.toHaveBeenCalled();
});

it('combines multiple required policies deterministically and preserves denial over allow', async () => {
  const calls: string[] = [];
  const modules = registry(
    ...['first', 'second'].map((id) =>
      middleware(id, (api) => {
        api.on('agent.beforeSpawn', () => {
          calls.push(id);
          return 'first' === id ? { action: 'deny', reason: 'approval' } : allow();
        });
      }),
    ),
  );
  expect(
    await dispatchPolicy(request, configuration('first', 'second'), modules, {
      requiredPolicies: ['second', 'first'],
    }),
  ).toMatchObject({
    outcome: 'deny',
    denials: [{ middlewareId: 'first', reason: 'approval' }],
    failures: [],
  });
  expect(calls).toEqual(['first', 'second']);
});

it.each([
  { requiredPolicies: ['required', 'required'] },
  { requiredPolicies: [''] },
  { requiredPolicies: [2] },
  { requiredPolicies: 'required' },
  { requiredPolicies: null },
  { requiredPolicies: Array.from({ length: 65 }, (_, index) => 'policy-' + String(index)) },
])('rejects invalid or duplicate requirement declarations %#', async (options) => {
  const result = failure(
    await dispatchPolicy(request, configuration(), new Map(), options as PolicyDispatchOptions),
  );
  expect(result.failures[0]).toMatchObject({ code: 'configuration-error', stage: 'configuration' });
});

it('rejects inconsistent duplicate middleware configuration even when one entry is disabled', async () => {
  const result = failure(
    await dispatchPolicy(
      request,
      {
        middleware: [
          { id: 'required', enabled: true },
          { id: 'required', enabled: false },
        ],
      },
      new Map(),
      required,
    ),
  );
  expect(result.failures[0]).toMatchObject({ code: 'configuration-error', stage: 'configuration' });
});

it.each(['requiredPolicies', 'timeoutMs', 'cleanupGraceMs'])(
  'rejects forged request option %s',
  async (field) => {
    expect(
      await dispatchPolicy({ ...request, [field]: [] }, configuration(), new Map(), required),
    ).toEqual({ outcome: 'invalid-request' });
  },
);

it('keeps different trusted requirement sets independent across concurrent requests', async () => {
  const modules = registry(
    middleware('present', (api) => {
      api.on('agent.beforeSpawn', allow);
    }),
  );
  const results = await Promise.all([
    dispatchPolicy(
      { ...request, executionId: 'claimed', agentId: 'native', parentAgentId: 'parent' },
      configuration('present'),
      modules,
      { requiredPolicies: ['present'] },
    ),
    dispatchPolicy(request, configuration('present'), modules, { requiredPolicies: ['missing'] }),
  ]);
  expect(results[0]).toMatchObject({ outcome: 'allow' });
  expect(failure(results[1]).failures[0]).toMatchObject({
    code: 'configuration-error',
    middlewareId: 'missing',
  });
});

it.each([0, -1, 0.5, NaN, Infinity, 60_001, null, '20'])(
  'rejects invalid timeout %# before allocating middleware',
  async (timeoutMs) => {
    const factory = vi.fn();
    const result = failure(
      await dispatchPolicy(request, configuration('required'), new Map([['required', factory]]), {
        timeoutMs,
      } as PolicyDispatchOptions),
    );
    expect(result.failures[0]).toMatchObject({
      stage: 'configuration',
      code: 'configuration-error',
    });
    expect(factory).not.toHaveBeenCalled();
  },
);

it.each([0, -1, 0.5, NaN, Infinity, 1001, null])(
  'rejects invalid cleanup grace %#',
  async (cleanupGraceMs) => {
    expect(
      failure(
        await dispatchPolicy(request, configuration(), new Map(), {
          cleanupGraceMs,
        } as PolicyDispatchOptions),
      ).failures[0],
    ).toMatchObject({ stage: 'configuration', code: 'configuration-error' });
  },
);

it('retains a handler rejection before the deadline as an exception', async () => {
  const cause = new Error('handler');
  const result = failure(
    await policy((api) => {
      api.on('agent.beforeSpawn', () => Promise.reject(cause));
    }),
  );
  expect(result.failures).toEqual([
    { code: 'exception', stage: 'handler', middlewareId: 'required', cause },
  ]);
});

it('times out a never-settling handler, aborts its signal and prevents subsequent handlers', async () => {
  const next = vi.fn(allow),
    cleanup = vi.fn();
  let signal: AbortSignal | undefined;
  const pending = policy((api) => {
    signal = api.signal;
    api.on('agent.beforeSpawn', () => new Promise<PolicyDecision>(() => undefined));
    api.on('agent.beforeSpawn', next);
    api.cleanup(cleanup);
  });
  await vi.advanceTimersByTimeAsync(20);
  const result = failure(await pending);
  expect(result.failures).toMatchObject([
    { stage: 'handler', code: 'timeout', middlewareId: 'required' },
  ]);
  expect(signal?.aborted).toBe(true);
  expect(next).not.toHaveBeenCalled();
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('shares one handler budget, preserving a prior denial when a later handler hangs', async () => {
  const first = deferred<PolicyDecision>();
  const pending = policy((api) => {
    api.on('agent.beforeSpawn', () => first.promise);
    api.on('agent.beforeSpawn', () => new Promise<PolicyDecision>(() => undefined));
  });
  await vi.advanceTimersByTimeAsync(12);
  first.resolve({ action: 'deny', reason: 'approval' });
  await vi.advanceTimersByTimeAsync(8);
  expect(failure(await pending)).toMatchObject({
    denials: [{ reason: 'approval' }],
    failures: [{ code: 'timeout', stage: 'handler' }],
  });
});

it('does not accept a cooperative handler allow returned in response to cancellation', async () => {
  const observed = vi.fn();
  const pending = policy((api) => {
    api.on(
      'agent.beforeSpawn',
      () =>
        new Promise<PolicyDecision>((resolve) => {
          api.signal!.addEventListener(
            'abort',
            () => {
              observed();
              resolve(allow());
            },
            { once: true },
          );
        }),
    );
  });
  await vi.advanceTimersByTimeAsync(20);
  expect(failure(await pending).failures[0]).toMatchObject({ code: 'timeout', stage: 'handler' });
  expect(observed).toHaveBeenCalledTimes(1);
});

it.each(['resolve', 'reject'] as const)(
  'contains late handler %s and keeps the final result immutable',
  async (settle) => {
    const gate = deferred<PolicyDecision>();
    let captured: PolicyAPI | undefined;
    const pending = policy((api) => {
      captured = api;
      api.on('agent.beforeSpawn', () => gate.promise);
    });
    await vi.advanceTimersByTimeAsync(20);
    const result = failure(await pending);
    const snapshot = JSON.stringify(result);
    if ('resolve' === settle) {
      gate.resolve(allow());
    } else {
      gate.reject(new Error('late rejection'));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.failures)).toBe(true);
    expect(Object.isFrozen(result.failures[0])).toBe(true);
    expect(() => {
      captured!.on('agent.beforeSpawn', allow);
    }).toThrow('registration');
    expect(() => {
      captured!.cleanup(() => undefined);
    }).toThrow('ended');
  },
);

it('allows cooperative cleanup time after cancellation without erasing the handler timeout', async () => {
  const released = deferred<undefined>();
  const cleanup = vi.fn();
  const pending = policy((api) => {
    api.on('agent.beforeSpawn', () => new Promise<PolicyDecision>(() => undefined));
    api.cleanup(() => {
      expect(api.signal?.aborted).toBe(true);
      cleanup();
      return released.promise;
    });
  });
  await vi.advanceTimersByTimeAsync(20);
  released.resolve(undefined);
  await vi.advanceTimersByTimeAsync(2);
  expect(failure(await pending).failures).toMatchObject([{ stage: 'handler', code: 'timeout' }]);
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('appends cleanup rejection after a primary handler timeout', async () => {
  const cause = new Error('cleanup');
  const pending = policy((api) => {
    api.on('agent.beforeSpawn', () => new Promise<PolicyDecision>(() => undefined));
    api.cleanup(() => Promise.reject(cause));
  });
  await vi.advanceTimersByTimeAsync(20);
  expect(failure(await pending).failures).toMatchObject([
    { stage: 'handler', code: 'timeout' },
    { stage: 'cleanup', code: 'exception', cause },
  ]);
});

it('bounds cleanup with shared grace, skips late callbacks and contains late rejection', async () => {
  const gate = deferred<undefined>();
  const calls: number[] = [];
  const pending = policy((api) => {
    api.on('agent.beforeSpawn', () => new Promise<PolicyDecision>(() => undefined));
    api.cleanup(() => {
      calls.push(1);
    });
    api.cleanup(() => {
      calls.push(2);
      return gate.promise;
    });
  });
  await vi.advanceTimersByTimeAsync(30);
  const result = failure(await pending);
  expect(result.failures).toMatchObject([
    { stage: 'handler', code: 'timeout' },
    { stage: 'cleanup', code: 'timeout' },
    { stage: 'cleanup', code: 'cleanup-skipped' },
  ]);
  expect(calls).toEqual([2]);
  expect(result.cleanup).toEqual([
    { middlewareId: 'required', registrationIndex: 1, status: 'timed-out' },
    { middlewareId: 'required', registrationIndex: 0, status: 'skipped-deadline' },
  ]);
  const snapshot = [...result.failures];
  gate.reject(new Error('late cleanup'));
  await vi.advanceTimersByTimeAsync(0);
  expect(result.failures).toEqual(snapshot);
});

it('counts a cleanup that crosses the overall deadline as timeout even if it settles within grace', async () => {
  const gate = deferred<undefined>();
  const pending = policy((api) => {
    api.on('agent.beforeSpawn', allow);
    api.cleanup(() => gate.promise);
  });
  await vi.advanceTimersByTimeAsync(21);
  gate.resolve(undefined);
  await vi.advanceTimersByTimeAsync(0);
  expect(failure(await pending).failures).toMatchObject([{ stage: 'cleanup', code: 'timeout' }]);
});

it('does not reset the overall budget for cleanup after fast handlers', async () => {
  const pending = policy((api) => {
    api.on('agent.beforeSpawn', allow);
    api.cleanup(() => new Promise<void>(() => undefined));
  });
  await vi.advanceTimersByTimeAsync(30);
  expect(failure(await pending).failures[0]).toMatchObject({ stage: 'cleanup', code: 'timeout' });
});

it('keeps concurrent cancellation and deadlines independent', async () => {
  const signals: AbortSignal[] = [];
  const register = (api: PolicyAPI) => {
    signals.push(api.signal!);
    api.on('agent.beforeSpawn', () => new Promise<PolicyDecision>(() => undefined));
  };
  const first = policy(register, { ...required, timeoutMs: 10 });
  const second = policy(register, { ...required, timeoutMs: 30 });
  await vi.advanceTimersByTimeAsync(10);
  expect(failure(await first).failures[0]).toMatchObject({ code: 'timeout' });
  expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
  await vi.advanceTimersByTimeAsync(20);
  expect(failure(await second).failures[0]).toMatchObject({ code: 'timeout' });
  expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
});

it('detects a synchronous registration that returns control after the deadline', async () => {
  const handler = vi.fn(allow),
    cleanup = vi.fn();
  const result = failure(
    await policy((api) => {
      api.cleanup(cleanup);
      api.on('agent.beforeSpawn', handler);
      vi.advanceTimersByTime(21);
    }),
  );
  expect(result.failures[0]).toMatchObject({
    code: 'timeout',
    stage: 'registration',
    middlewareId: 'required',
  });
  expect(handler).not.toHaveBeenCalled();
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('checks elapsed monotonic time even when timer delivery was delayed by synchronous work', async () => {
  const clock = vi.spyOn(performance, 'now');
  try {
    const result = failure(
      await policy((api) => {
        api.on('agent.beforeSpawn', () => {
          clock.mockReturnValue(25);
          return allow();
        });
      }),
    );
    expect(result.failures[0]).toMatchObject({ code: 'timeout', stage: 'handler' });
  } finally {
    clock.mockRestore();
  }
});

it('never authorizes when synchronous decision access crosses the deadline', async () => {
  const result = failure(
    await policy((api) => {
      api.on('agent.beforeSpawn', () => ({
        get action() {
          vi.advanceTimersByTime(20);
          return 'allow' as const;
        },
      }));
    }),
  );
  expect(result.failures[0]).toMatchObject({ code: 'timeout', stage: 'handler' });
});

it('accepts the documented timeout and cleanup bounds', async () => {
  for (const options of [
    { timeoutMs: 1, cleanupGraceMs: 1 },
    { timeoutMs: 60_000, cleanupGraceMs: 1000 },
  ]) {
    expect(
      await policy((api) => {
        api.on('agent.beforeSpawn', allow);
      }, options),
    ).toMatchObject({ outcome: 'allow' });
  }
});

it('accepts exactly 64 distinct required policies', async () => {
  const ids = Array.from({ length: 64 }, (_, index) => 'policy-' + String(index));
  const modules = registry(
    ...ids.map((id) =>
      middleware(id, (api) => {
        api.on('agent.beforeSpawn', allow);
      }),
    ),
  );
  expect(
    await dispatchPolicy(request, configuration(...ids), modules, { requiredPolicies: ids }),
  ).toMatchObject({ outcome: 'allow' });
});

it('does not let an unrelated handler satisfy another required policy', async () => {
  const handler = vi.fn(allow),
    cleanup = vi.fn();
  const result = failure(
    await dispatchPolicy(
      request,
      configuration('first', 'required'),
      registry(
        middleware('first', (api) => {
          api.on('agent.beforeSpawn', handler);
          api.cleanup(cleanup);
        }),
        middleware('required', () => undefined),
      ),
      { requiredPolicies: ['first', 'required'] },
    ),
  );
  expect(result.failures[0]).toMatchObject({
    code: 'configuration-error',
    stage: 'registration',
    middlewareId: 'required',
    cause: new Error('Required policy has no applicable handler'),
  });
  expect(handler).not.toHaveBeenCalled();
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('does not confuse a disabled unrelated entry with the enabled required entry', async () => {
  const modules = registry(
    middleware('required', (api) => {
      api.on('agent.beforeSpawn', allow);
    }),
  );
  expect(
    await dispatchPolicy(
      request,
      {
        middleware: [
          { id: 'other', enabled: false },
          { id: 'required', enabled: true },
        ],
      },
      modules,
      required,
    ),
  ).toMatchObject({ outcome: 'allow' });
});

it('rejects duplicate configured entries even when the required module could otherwise allow', async () => {
  const factory = vi.fn(() =>
    middleware('required', (api) => {
      api.on('agent.beforeSpawn', allow);
    }),
  );
  const result = failure(
    await dispatchPolicy(
      request,
      {
        middleware: [
          { id: 'required', enabled: true },
          { id: 'required', enabled: false },
        ],
      },
      new Map([['required', factory]]),
      required,
    ),
  );
  expect(result.failures[0]).toMatchObject({
    code: 'configuration-error',
    stage: 'configuration',
    cause: new Error('Duplicate middleware configuration'),
  });
  expect(factory).not.toHaveBeenCalled();
});

it('rejects duplicate requirements even when the configured policy would allow', async () => {
  const result = failure(
    await policy(
      (api) => {
        api.on('agent.beforeSpawn', allow);
      },
      { requiredPolicies: ['required', 'required'] },
    ),
  );
  expect(result.failures[0]).toMatchObject({
    code: 'configuration-error',
    stage: 'configuration',
    cause: new Error('Duplicate policy requirement'),
  });
});

it.each(['', '1budget', 'budget!', 'UPPER'])(
  'validates required ID %j before touching factories',
  async (id) => {
    const factory = vi.fn(() =>
      middleware(id, (api) => {
        api.on('agent.beforeSpawn', allow);
      }),
    );
    const result = failure(
      await dispatchPolicy(request, configuration(id), new Map([[id, factory]]), {
        requiredPolicies: [id],
      }),
    );
    expect(result.failures[0]).toMatchObject({
      stage: 'configuration',
      code: 'configuration-error',
      middlewareId: '',
      cause: new Error('Invalid policy requirement'),
    });
    expect(factory).not.toHaveBeenCalled();
  },
);

it('rejects 65 valid configured requirements before instantiating modules', async () => {
  const ids = Array.from({ length: 65 }, (_, index) => 'policy-' + String(index));
  const factory = vi.fn();
  const modules: Registry = new Map(ids.map((id) => [id, factory]));
  const result = failure(
    await dispatchPolicy(request, configuration(...ids), modules, { requiredPolicies: ids }),
  );
  expect(result.failures[0]).toMatchObject({
    stage: 'configuration',
    code: 'configuration-error',
    middlewareId: '',
    cause: new Error('Invalid policy dispatch options'),
  });
  expect(factory).not.toHaveBeenCalled();
});

it('closes each registration window before the next middleware registers', async () => {
  let captured: PolicyAPI | undefined, caught: unknown;
  const injected = vi.fn(allow);
  const modules = registry(
    middleware('first', (api) => {
      captured = api;
      api.on('agent.beforeSpawn', allow);
    }),
    middleware('second', (api) => {
      try {
        captured!.on('agent.beforeSpawn', injected);
      } catch (error) {
        caught = error;
      }
      api.on('agent.beforeSpawn', allow);
    }),
  );
  expect(
    await dispatchPolicy(request, configuration('first', 'second'), modules, {
      requiredPolicies: ['first', 'second'],
    }),
  ).toMatchObject({ outcome: 'allow' });
  expect(caught).toEqual(new Error('Invalid policy hook registration'));
  expect(injected).not.toHaveBeenCalled();
});

it('retains exception classification after a previous successful registration', async () => {
  const cause = new Error('second factory'),
    cleanup = vi.fn();
  const result = failure(
    await dispatchPolicy(
      request,
      configuration('first', 'second'),
      new Map([
        [
          'first',
          () =>
            middleware('first', (api) => {
              api.cleanup(cleanup);
              api.on('agent.beforeSpawn', allow);
            }),
        ],
        [
          'second',
          () => {
            throw cause;
          },
        ],
      ]),
    ),
  );
  expect(result.failures[0]).toEqual({
    code: 'exception',
    stage: 'registration',
    middlewareId: 'second',
    cause,
  });
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('retains the invalid-decision failure code', async () => {
  const result = failure(
    await policy((api) => {
      api.on('agent.beforeSpawn', () => null as unknown as PolicyDecision);
    }),
  );
  expect(result.failures[0]).toEqual({
    code: 'invalid-decision',
    stage: 'handler',
    middlewareId: 'required',
    cause: new Error('Invalid policy decision'),
  });
});

it('does not start another handler if synchronous decision processing used the remaining budget', async () => {
  let reads = 0;
  const later = vi.fn(allow);
  const result = failure(
    await policy((api) => {
      api.on('agent.beforeSpawn', () => ({
        get action() {
          reads++;
          if (2 === reads) {
            vi.advanceTimersByTime(20);
          }
          return 'allow' as const;
        },
      }));
      api.on('agent.beforeSpawn', later);
    }),
  );
  expect(result.failures[0]).toMatchObject({
    code: 'timeout',
    stage: 'handler',
    middlewareId: 'required',
  });
  expect(later).not.toHaveBeenCalled();
});
