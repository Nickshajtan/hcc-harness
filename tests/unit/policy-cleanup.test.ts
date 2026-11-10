import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  dispatchPolicy,
  type PolicyAPI,
  type PolicyDecision,
  type PolicyResult,
} from '../../src/policy.js';
import type { Registry } from '../../src/middleware.js';

const request = { type: 'agent.beforeSpawn', requestId: 'cleanup-request', provider: 'mock' };
function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function dispatch(register: (api: PolicyAPI) => void, timeoutMs = 20, cleanupGraceMs = 10) {
  const registry: Registry = new Map([
    ['local', () => ({ id: 'local', register: () => undefined, registerPolicy: register })],
  ]);
  return dispatchPolicy(request, { middleware: [{ id: 'local', enabled: true }] }, registry, {
    requiredPolicies: ['local'],
    timeoutMs,
    cleanupGraceMs,
  });
}
function correlated(result: PolicyResult) {
  if ('invalid-request' === result.outcome) {
    throw new Error('Expected a correlated result');
  }
  return result;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it('reports every completed cleanup in reverse order within the original budget', async () => {
  const calls: number[] = [];
  const result = correlated(
    await dispatch((api) => {
      api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
      api.cleanup(() => {
        calls.push(0);
      });
      api.cleanup(() => {
        calls.push(1);
        return Promise.resolve();
      });
    }),
  );
  expect(result.outcome).toBe('allow');
  expect(calls).toEqual([1, 0]);
  expect(result.cleanup).toEqual([
    { middlewareId: 'local', registrationIndex: 1, status: 'completed' },
    { middlewareId: 'local', registrationIndex: 0, status: 'completed' },
  ]);
  expect(Object.isFrozen(result.cleanup)).toBe(true);
  expect(result.cleanup.every(Object.isFrozen)).toBe(true);
});

it('does not start any cleanup when the grace deadline is already exhausted', async () => {
  const callback = vi.fn();
  const result = correlated(
    await dispatch((api) => {
      api.cleanup(callback);
      api.on('agent.beforeSpawn', () => {
        vi.advanceTimersByTime(30);
        return { action: 'allow' };
      });
    }),
  );
  expect(result.outcome).toBe('policy-error');
  expect(result.failures).toMatchObject([
    { code: 'timeout', stage: 'handler' },
    { code: 'cleanup-skipped', stage: 'cleanup' },
  ]);
  expect(result.cleanup).toEqual([
    { middlewareId: 'local', registrationIndex: 0, status: 'skipped-deadline' },
  ]);
  expect(callback).not.toHaveBeenCalled();
});

it.each(['allow', 'deny', 'timeout'] as const)(
  'refuses incomplete cleanup after handler %s and never starts later callbacks',
  async (action) => {
    const gate = deferred(),
      skipped = vi.fn();
    const pending = dispatch((api) => {
      api.on('agent.beforeSpawn', () => {
        if ('timeout' === action) {
          return new Promise<PolicyDecision>(() => undefined);
        }
        if ('deny' === action) {
          return { action: 'deny', reason: 'approval' };
        }
        return { action: 'allow' };
      });
      api.cleanup(skipped);
      api.cleanup(() => gate.promise);
    });
    await vi.advanceTimersByTimeAsync(30);
    const result = correlated(await pending);
    expect(result.outcome).toBe('policy-error');
    expect(result.cleanup.map((entry) => entry.status)).toEqual(['timed-out', 'skipped-deadline']);
    expect(result.failures.at(-1)).toMatchObject({
      code: 'cleanup-skipped',
      stage: 'cleanup',
      middlewareId: 'local',
    });
    expect(result.failures[0]).toMatchObject({
      code: 'timeout',
      stage: 'timeout' === action ? 'handler' : 'cleanup',
    });
    expect(result.denials).toEqual(
      'deny' === action ? [{ middlewareId: 'local', reason: 'approval' }] : [],
    );
    expect(skipped).not.toHaveBeenCalled();
    const snapshot = JSON.stringify(result);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.stringify(result)).toBe(snapshot);
  },
);

it('does not admit a later callback when a synchronous callback consumes the exact grace end', async () => {
  const skipped = vi.fn();
  const result = correlated(
    await dispatch((api) => {
      api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
      api.cleanup(skipped);
      api.cleanup(() => {
        vi.advanceTimersByTime(30);
      });
    }),
  );
  expect(result.outcome).toBe('policy-error');
  expect(result.cleanup.map((entry) => entry.status)).toEqual(['timed-out', 'skipped-deadline']);
  expect(skipped).not.toHaveBeenCalled();
});

it.each(['throw', 'reject'] as const)(
  'records a cleanup %s as failed and admits the next callback while time remains',
  async (mode) => {
    const cause = new Error('cleanup failed'),
      next = vi.fn();
    const result = correlated(
      await dispatch((api) => {
        api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
        api.cleanup(next);
        api.cleanup(() => {
          if ('throw' === mode) {
            throw cause;
          }
          return Promise.reject(cause);
        });
      }),
    );
    expect(result.outcome).toBe('policy-error');
    expect(result.cleanup.map((entry) => entry.status)).toEqual(['failed', 'completed']);
    expect(result.failures[0]).toEqual({
      stage: 'cleanup',
      code: 'exception',
      middlewareId: 'local',
      cause,
    });
    expect(next).toHaveBeenCalledTimes(1);
  },
);

it('preserves a handler exception as primary and safely observes unfinished cleanup rejection', async () => {
  const cause = new Error('handler failed'),
    gate = deferred(),
    skipped = vi.fn();
  const pending = dispatch((api) => {
    api.on('agent.beforeSpawn', () => {
      throw cause;
    });
    api.cleanup(skipped);
    api.cleanup(() => gate.promise);
  });
  await vi.advanceTimersByTimeAsync(30);
  const result = correlated(await pending);
  expect(result.outcome).toBe('policy-error');
  expect(result.failures[0]).toEqual({
    code: 'exception',
    stage: 'handler',
    middlewareId: 'local',
    cause,
  });
  expect(result.cleanup.map((entry) => entry.status)).toEqual(['timed-out', 'skipped-deadline']);
  const snapshot = JSON.stringify(result);
  gate.reject(new Error('late cleanup rejection'));
  await vi.advanceTimersByTimeAsync(0);
  expect(JSON.stringify(result)).toBe(snapshot);
  expect(skipped).not.toHaveBeenCalled();
});

it('admits cleanup during grace but still refuses a dispatch that crossed its original deadline', async () => {
  const gate = deferred(),
    next = vi.fn();
  const pending = dispatch((api) => {
    api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
    api.cleanup(next);
    api.cleanup(() => gate.promise);
  });
  await vi.advanceTimersByTimeAsync(29);
  gate.resolve();
  await vi.advanceTimersByTimeAsync(0);
  const result = correlated(await pending);
  expect(result.outcome).toBe('policy-error');
  expect(result.failures[0]).toMatchObject({ code: 'timeout', stage: 'cleanup' });
  expect(result.cleanup.map((entry) => entry.status)).toEqual(['completed', 'completed']);
  expect(next).toHaveBeenCalledTimes(1);
});

it('keeps concurrent cleanup admission windows independent', async () => {
  const calls: number[] = [];
  const register = (api: PolicyAPI) => {
    api.on('agent.beforeSpawn', () => ({ action: 'allow' as const }));
    api.cleanup(() => {
      calls.push(1);
    });
    api.cleanup(() => new Promise<void>(() => undefined));
  };
  const first = dispatch(register, 10, 5),
    second = dispatch(register, 30, 5);
  await vi.advanceTimersByTimeAsync(15);
  expect(correlated(await first).cleanup.map((entry) => entry.status)).toEqual([
    'timed-out',
    'skipped-deadline',
  ]);
  await vi.advanceTimersByTimeAsync(20);
  expect(correlated(await second).cleanup.map((entry) => entry.status)).toEqual([
    'timed-out',
    'skipped-deadline',
  ]);
  expect(calls).toEqual([]);
});
