import { expect, it, vi } from 'vitest';
import {
  dispatchPolicy,
  parsePolicyRequest,
  type PolicyAPI,
  type PolicyDecision,
} from '../../src/policy.js';
import type { ArchMiddleware, Registry } from '../../src/middleware.js';

const request = { type: 'agent.beforeSpawn', requestId: 'request-1', provider: 'mock' };
const config = (...ids: string[]) => ({ middleware: ids.map((id) => ({ id, enabled: true })) });
function module(id: string, registerPolicy: (api: PolicyAPI) => void): ArchMiddleware {
  return {
    id,
    register: () => {
      throw new Error('Process registration must not run');
    },
    registerPolicy,
  };
}
function registry(...modules: ArchMiddleware[]): Registry {
  return new Map(modules.map((middleware) => [middleware.id, () => middleware]));
}

it('allows independently without creating identities or a model, with a frozen copied request', async () => {
  const received: unknown[] = [];
  const modules = registry(
    module('inspect', (api) => {
      expect('context' in api).toBe(false);
      expect('setEnv' in api).toBe(false);
      api.on('agent.beforeSpawn', (value) => {
        expect(Object.isFrozen(value)).toBe(true);
        expect(value).not.toBe(request);
        received.push(value);
        return { action: 'allow' };
      });
    }),
  );
  expect(await dispatchPolicy(request, config('inspect'), modules)).toEqual({
    outcome: 'allow',
    requestId: 'request-1',
    cleanup: [],
    denials: [],
    failures: [],
  });
  expect(received).toEqual([request]);
  expect(await dispatchPolicy(request, config(), new Map())).toMatchObject({ outcome: 'allow' });
});

it('uses configuration then handler order, retains every denial, and cleans once in reverse order', async () => {
  const calls: string[] = [];
  const modules = registry(
    ...['first', 'second'].map((id) =>
      module(id, (api) => {
        calls.push('register:' + id);
        api.on('agent.beforeSpawn', () => {
          calls.push('deny:' + id);
          return { action: 'deny', reason: id };
        });
        api.on('agent.beforeSpawn', () => {
          calls.push('allow:' + id);
          return { action: 'allow' };
        });
        api.cleanup(() => {
          calls.push('cleanup:' + id);
        });
      }),
    ),
  );
  const result = await dispatchPolicy(request, config('second', 'first'), modules);
  expect(result).toEqual({
    outcome: 'deny',
    requestId: request.requestId,
    cleanup: [
      { middlewareId: 'first', registrationIndex: 1, status: 'completed' },
      { middlewareId: 'second', registrationIndex: 0, status: 'completed' },
    ],
    denials: [
      { middlewareId: 'second', reason: 'second' },
      { middlewareId: 'first', reason: 'first' },
    ],
    failures: [],
  });
  expect(calls).toEqual([
    'register:second',
    'register:first',
    'deny:second',
    'allow:second',
    'deny:first',
    'allow:first',
    'cleanup:first',
    'cleanup:second',
  ]);
});

it('skips disabled entries and does not run process-only registrations', async () => {
  const factory = vi.fn();
  expect(
    await dispatchPolicy(
      request,
      {
        middleware: [
          { id: 'disabled', enabled: false },
          { id: 'process', enabled: true },
        ],
      },
      new Map<string, () => ArchMiddleware>([
        ['disabled', factory],
        [
          'process',
          () => ({
            id: 'process',
            register: () => {
              throw new Error('unexpected');
            },
          }),
        ],
      ]),
    ),
  ).toMatchObject({ outcome: 'allow' });
  expect(factory).not.toHaveBeenCalled();
});

it.each([undefined, null, 'failure', new Error('sensitive exception')])(
  'fails closed on thrown %s and preserves primary and cleanup failures',
  async (cause) => {
    const secondary = new Error('cleanup');
    const later = vi.fn((): PolicyDecision => ({ action: 'allow' }));
    const cleaned: number[] = [];
    const result = await dispatchPolicy(
      request,
      config('broken'),
      registry(
        module('broken', (api) => {
          api.cleanup(() => {
            cleaned.push(1);
          });
          api.cleanup(() => {
            cleaned.push(2);
            throw secondary;
          });
          api.on('agent.beforeSpawn', () => ({ action: 'deny', reason: 'prior denial' }));
          api.on('agent.beforeSpawn', () => {
            // Deliberately exercise JavaScript's non-Error thrown values at this boundary.
            throw cause as Error;
          });
          api.on('agent.beforeSpawn', later);
        }),
      ),
    );
    expect(result).toMatchObject({
      outcome: 'policy-error',
      denials: [{ reason: 'prior denial' }],
      failures: [
        { stage: 'handler', middlewareId: 'broken', cause },
        { stage: 'cleanup', middlewareId: 'broken', cause: secondary },
      ],
    });
    expect(cleaned).toEqual([2, 1]);
    expect(later).not.toHaveBeenCalled();
  },
);

it('blocks an allow when cleanup fails and rejects late registrations', async () => {
  let captured: PolicyAPI | undefined;
  const result = await dispatchPolicy(
    request,
    config('local'),
    registry(
      module('local', (api) => {
        captured = api;
        api.on('agent.beforeSpawn', () => {
          expect(() => {
            api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
          }).toThrow('registration');
          api.cleanup(() => {
            throw new Error('cleanup');
          });
          return { action: 'allow' };
        });
      }),
    ),
  );
  expect(result).toMatchObject({ outcome: 'policy-error', failures: [{ stage: 'cleanup' }] });
  expect(() => {
    captured!.cleanup(() => undefined);
  }).toThrow('ended');
  expect(() => {
    captured!.on('agent.beforeSpawn', () => ({ action: 'allow' }));
  }).toThrow('registration');
});

it('cleans partial registration and distinguishes registry failures', async () => {
  const cleaned = vi.fn();
  const cause = new Error('registration');
  expect(
    await dispatchPolicy(
      request,
      config('local'),
      registry(
        module('local', (api) => {
          api.cleanup(cleaned);
          api.on('wrong' as 'agent.beforeSpawn', () => ({ action: 'allow' }));
        }),
      ),
    ),
  ).toMatchObject({ outcome: 'policy-error', failures: [{ stage: 'registration' }] });
  expect(cleaned).toHaveBeenCalledTimes(1);
  for (const modules of [
    new Map(),
    registry(module('different', () => undefined)),
    new Map([
      [
        'local',
        () => {
          throw cause;
        },
      ],
    ]),
  ]) {
    expect(await dispatchPolicy(request, config('local'), modules)).toMatchObject({
      outcome: 'policy-error',
      failures: [{ stage: 'registration' }],
    });
  }
  expect(
    await dispatchPolicy(
      request,
      config('local'),
      new Map([['local', () => module('different', () => undefined)]]),
    ),
  ).toMatchObject({ outcome: 'policy-error', failures: [{ stage: 'registration' }] });
});

it.each([
  undefined,
  null,
  {},
  { action: 'modify' },
  { action: 'deny', reason: '' },
  { action: 'allow', extra: true },
  { action: 'deny', reason: 'x', extra: true },
])('rejects malformed decision %j', async (decision) => {
  expect(
    await dispatchPolicy(
      request,
      config('bad'),
      registry(
        module('bad', (api) => {
          api.on('agent.beforeSpawn', () => decision as PolicyDecision);
        }),
      ),
    ),
  ).toMatchObject({ outcome: 'policy-error', failures: [{ stage: 'handler' }] });
});

it.each([
  null,
  [],
  {},
  { ...request, type: 'unknown' },
  { ...request, extra: 'x' },
  { ...request, requestId: '' },
  { ...request, provider: 2 },
  { ...request, requestedModel: null },
  { ...request, agentId: undefined },
  { ...request, executionId: 'x\nsecret' },
  { ...request, agentId: 'x'.repeat(257) },
])('rejects malformed input %j before allocating modules', async (input) => {
  const factory = vi.fn();
  expect(parsePolicyRequest(input)).toBeUndefined();
  expect(await dispatchPolicy(input, config('unused'), new Map([['unused', factory]]))).toEqual({
    outcome: 'invalid-request',
  });
  expect(factory).not.toHaveBeenCalled();
});

it('preserves untrusted correlation as separate opaque fields without authorizing premium delegation', async () => {
  const input = {
    ...request,
    executionId: 'claimed-execution',
    agentId: 'native-agent',
    parentAgentId: 'native-parent',
    requestedModel: 'premium',
    agentType: 'worker',
  };
  expect(parsePolicyRequest(input)).toEqual(input);
  expect(
    await dispatchPolicy(
      input,
      config('model'),
      registry(
        module('model', (api) => {
          api.on('agent.beforeSpawn', (value) =>
            'premium' === value.requestedModel
              ? { action: 'deny', reason: 'approval' }
              : { action: 'allow' },
          );
        }),
      ),
    ),
  ).toMatchObject({ outcome: 'deny' });
});

it('isolates concurrent factory state and cleanup using an explicit handler barrier', async () => {
  const arrivals: string[] = [],
    cleaned: string[] = [];
  let release: () => void = () => undefined;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let instances = 0;
  const modules: Registry = new Map([
    [
      'local',
      () => {
        instances++;
        let ownRequest = '';
        return module('local', (api) => {
          api.cleanup(() => {
            cleaned.push(ownRequest);
          });
          api.on('agent.beforeSpawn', async (value) => {
            ownRequest = value.requestId;
            arrivals.push(ownRequest);
            if (2 === arrivals.length) {
              release();
            }
            await barrier;
            return { action: 'allow' };
          });
        });
      },
    ],
  ]);
  const results = await Promise.all(
    ['one', 'two'].map((requestId) =>
      dispatchPolicy({ ...request, requestId }, config('local'), modules),
    ),
  );
  expect(instances).toBe(2);
  expect(results.map((result) => result.outcome)).toEqual(['allow', 'allow']);
  expect(cleaned.sort()).toEqual(['one', 'two']);
});

it('accepts the maximum field length and rejects inherited required fields', () => {
  expect(
    parsePolicyRequest({ ...request, requestedModel: 'x'.repeat(256) })?.requestedModel,
  ).toHaveLength(256);
  const inherited = { type: request.type, requestId: request.requestId };
  Object.setPrototypeOf(inherited, { provider: 'mock' });
  expect(parsePolicyRequest(inherited)).toBeUndefined();
  const inheritedType = { provider: 'mock', requestId: request.requestId };
  Object.setPrototypeOf(inheritedType, { type: request.type });
  expect(parsePolicyRequest(inheritedType)).toBeUndefined();
});

it('rejects cleanup registration during cleanup and preserves its diagnostic', async () => {
  const result = await dispatchPolicy(
    request,
    config('local'),
    registry(
      module('local', (api) => {
        api.cleanup(() => {
          api.cleanup(() => undefined);
        });
      }),
    ),
  );
  expect(result).toMatchObject({
    outcome: 'policy-error',
    failures: [{ stage: 'cleanup', cause: new Error('Policy cleanup registration has ended') }],
  });
});

it('preserves specific local validation diagnostics without turning malformed decisions into allow', async () => {
  for (const [modules, message] of [
    [new Map(), 'Unknown middleware'],
    [
      new Map([['local', () => module('wrong', () => undefined)]]),
      'Middleware registration id mismatch',
    ],
    [
      registry(
        module('local', (api) => {
          api.on(
            'agent.beforeSpawn',
            () => ({ action: 'unknown', reason: 'valid' }) as unknown as PolicyDecision,
          );
        }),
      ),
      'Invalid policy decision',
    ],
    [
      registry(
        module('local', (api) => {
          api.on('agent.beforeSpawn', () => undefined as unknown as PolicyDecision);
        }),
      ),
      'Invalid policy decision',
    ],
  ] as const) {
    expect(await dispatchPolicy(request, config('local'), modules)).toMatchObject({
      outcome: 'policy-error',
      failures: [{ cause: new Error(message) }],
    });
  }
});

it('rejects decisions that inherit action or reason rather than returning the decision contract', async () => {
  const inheritedAction = { extra: 'field' };
  Object.setPrototypeOf(inheritedAction, { action: 'allow' });
  const inheritedReason = { action: 'deny', extra: 'field' };
  Object.setPrototypeOf(inheritedReason, { reason: 'approval' });
  for (const decision of [inheritedAction, inheritedReason]) {
    expect(
      await dispatchPolicy(
        request,
        config('local'),
        registry(
          module('local', (api) => {
            api.on('agent.beforeSpawn', () => decision as unknown as PolicyDecision);
          }),
        ),
      ),
    ).toMatchObject({ outcome: 'policy-error' });
  }
});
