import type { Configuration } from './config.js';
import type { Registry } from './middleware.js';

import type {
  AgentBeforeSpawn,
  PolicyDecision,
  PolicyDenial,
  PolicyFailure,
  PolicyResult,
} from './policy-contract.js';
export type {
  AgentBeforeSpawn,
  PolicyAPI,
  PolicyDecision,
  PolicyResult,
} from './policy-contract.js';
const requestFields = [
  'type',
  'requestId',
  'provider',
  'executionId',
  'agentId',
  'parentAgentId',
  'requestedModel',
  'agentType',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return null !== value && 'object' === typeof value && !Array.isArray(value);
}

function isBoundedText(value: unknown): value is string {
  return (
    'string' === typeof value &&
    0 < value.length &&
    256 >= value.length &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

/** Copy only validated flat JSON fields; never synthesize missing identity or model data. */
export function parsePolicyRequest(value: unknown): AgentBeforeSpawn | undefined {
  if (
    !isRecord(value) ||
    !['type', 'requestId', 'provider'].every((key) => Object.hasOwn(value, key)) ||
    'agent.beforeSpawn' !== value.type ||
    !isBoundedText(value.requestId) ||
    !isBoundedText(value.provider) ||
    Object.keys(value).some((key) => !requestFields.includes(key as (typeof requestFields)[number]))
  ) {
    return undefined;
  }
  const request: Record<string, string> = {};
  for (const key of requestFields) {
    if (!Object.hasOwn(value, key)) {
      continue;
    }
    const field = value[key];
    if (!isBoundedText(field)) {
      return undefined;
    }
    request[key] = field;
  }
  return Object.freeze(request) as unknown as AgentBeforeSpawn;
}

function validDecision(value: unknown): value is PolicyDecision {
  if (!isRecord(value) || !Object.hasOwn(value, 'action')) {
    return false;
  }
  if ('allow' === value.action) {
    return 1 === Object.keys(value).length;
  }
  return (
    'deny' === value.action &&
    Object.hasOwn(value, 'reason') &&
    isBoundedText(value.reason) &&
    2 === Object.keys(value).length
  );
}

/** One invocation owns all handlers and cleanup. EventBus deliberately has no role here. */
export async function dispatchPolicy(
  input: unknown,
  configuration: Pick<Configuration, 'middleware'>,
  registry: Registry,
): Promise<PolicyResult> {
  const request = parsePolicyRequest(input);
  if (!request) {
    return { outcome: 'invalid-request' };
  }
  const handlers: {
    id: string;
    run: (request: AgentBeforeSpawn) => PolicyDecision | Promise<PolicyDecision>;
  }[] = [];
  const cleanups: { id: string; run: () => void | Promise<void> }[] = [];
  const denials: PolicyDenial[] = [];
  const failures: PolicyFailure[] = [];
  let state: 'registration' | 'handlers' | 'cleanup' | 'closed' = 'registration';
  let currentId = '';
  try {
    for (const entry of configuration.middleware) {
      if (!entry.enabled) {
        continue;
      }
      currentId = entry.id;
      const factory = registry.get(entry.id);
      if (!factory) {
        throw new Error('Unknown middleware');
      }
      const middleware = factory();
      if (middleware.id !== entry.id) {
        throw new Error('Middleware registration id mismatch');
      }
      const id = entry.id;
      middleware.registerPolicy?.(
        Object.freeze({
          on(
            type: string,
            run: (request: AgentBeforeSpawn) => PolicyDecision | Promise<PolicyDecision>,
          ) {
            if ('registration' !== state || 'agent.beforeSpawn' !== type) {
              throw new Error('Invalid policy hook registration');
            }
            handlers.push({ id, run });
          },
          cleanup(run: () => void | Promise<void>) {
            if ('cleanup' === state || 'closed' === state) {
              throw new Error('Policy cleanup registration has ended');
            }
            cleanups.push({ id, run });
          },
        }),
      );
    }
    state = 'handlers';
    for (const handler of handlers) {
      currentId = handler.id;
      const decision: unknown = await handler.run(request);
      if (!validDecision(decision)) {
        throw new Error('Invalid policy decision');
      }
      if ('deny' === decision.action) {
        denials.push(Object.freeze({ middlewareId: handler.id, reason: decision.reason }));
      }
    }
  } catch (cause) {
    failures.push({
      stage: 'registration' === state ? 'registration' : 'handler',
      middlewareId: currentId,
      cause,
    });
  } finally {
    state = 'cleanup';
    for (const cleanup of cleanups.reverse()) {
      try {
        await cleanup.run();
      } catch (cause) {
        failures.push({ stage: 'cleanup', middlewareId: cleanup.id, cause });
      }
    }
    state = 'closed';
  }
  let outcome: 'allow' | 'deny' | 'policy-error' = 'allow';
  if (denials.length) {
    outcome = 'deny';
  }
  if (failures.length) {
    outcome = 'policy-error';
  }
  return Object.freeze({
    outcome,
    requestId: request.requestId,
    denials: Object.freeze(denials),
    failures: Object.freeze(failures),
  });
}
