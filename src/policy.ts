import type { Configuration } from './config.js';
import type { Registry } from './middleware.js';
import { isPromise } from 'node:util/types';
import { PolicyDeadline } from './policy-deadline.js';

import type {
  AgentBeforeSpawn,
  PolicyDecision,
  PolicyDenial,
  PolicyFailure,
  PolicyResult,
  PolicyDispatchOptions,
} from './policy-contract.js';
export type {
  AgentBeforeSpawn,
  PolicyAPI,
  PolicyDecision,
  PolicyResult,
  PolicyDispatchOptions,
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

function dispatchOptions(options: PolicyDispatchOptions) {
  const { timeoutMs = 5000, cleanupGraceMs = 100, requiredPolicies: candidate = [] } = options;
  if (
    !Number.isInteger(timeoutMs) ||
    1 > timeoutMs ||
    60_000 < timeoutMs ||
    !Number.isInteger(cleanupGraceMs) ||
    1 > cleanupGraceMs ||
    1000 < cleanupGraceMs ||
    !Array.isArray(candidate) ||
    64 < candidate.length
  ) {
    throw new Error('Invalid policy dispatch options');
  }
  const requirements: readonly unknown[] = candidate;
  const requiredPolicies = requirements.map((id) => {
    if ('string' !== typeof id || !/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new Error('Invalid policy requirement');
    }
    return id;
  });
  if (new Set(requiredPolicies).size !== requiredPolicies.length) {
    throw new Error('Duplicate policy requirement');
  }
  return { timeoutMs, cleanupGraceMs, requiredPolicies };
}

function assertSynchronousRegistration(returned: unknown): void {
  if (undefined === returned) {
    return;
  }
  if (isPromise(returned)) {
    // Do not invoke a user-defined then/catch or assimilate arbitrary thenables.
    // Observe genuine rejected async registrations, including their late API errors.
    void Promise.prototype.then.call(
      returned,
      () => undefined,
      () => undefined,
    );
  }
  throw new Error('Policy registration must return undefined synchronously');
}

/** One invocation owns all handlers and cleanup. EventBus deliberately has no role here. */
export async function dispatchPolicy(
  input: unknown,
  configuration: Pick<Configuration, 'middleware'>,
  registry: Registry,
  options: PolicyDispatchOptions = {},
): Promise<PolicyResult> {
  const request = parsePolicyRequest(input);
  if (!request) {
    return Object.freeze({ outcome: 'invalid-request' });
  }
  const handlers: {
    id: string;
    run: (request: AgentBeforeSpawn) => PolicyDecision | Promise<PolicyDecision>;
  }[] = [];
  const cleanups: { id: string; run: () => void | Promise<void> }[] = [];
  const denials: PolicyDenial[] = [];
  const failures: PolicyFailure[] = [];
  let state: 'configuration' | 'registration' | 'handler' | 'cleanup' | 'closed' = 'configuration';
  let currentId = '';
  let code: PolicyFailure['code'] = 'configuration-error';
  let deadline: PolicyDeadline | undefined;
  try {
    const settings = dispatchOptions(options);
    const entries = configuration.middleware.map((entry) => ({ ...entry }));
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
      throw new Error('Duplicate middleware configuration');
    }
    for (const id of settings.requiredPolicies) {
      currentId = id;
      const entry = entries.find((entry) => entry.id === id);
      if (!entry || !registry.has(id)) {
        throw new Error('Required policy is missing');
      }
      if (!entry.enabled) {
        throw new Error('Required policy is disabled');
      }
    }
    deadline = new PolicyDeadline(settings.timeoutMs, settings.cleanupGraceMs);
    const activeDeadline = deadline;
    state = 'registration';
    code = 'exception';
    for (const entry of entries) {
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
        code = 'configuration-error';
        throw new Error('Middleware registration id mismatch');
      }
      const id = entry.id;
      let registering = true;
      try {
        const returned: unknown = middleware.registerPolicy?.(
          Object.freeze({
            signal: activeDeadline.signal,
            on(
              type: string,
              run: (request: AgentBeforeSpawn) => PolicyDecision | Promise<PolicyDecision>,
            ) {
              if (
                !registering ||
                'registration' !== state ||
                activeDeadline.hasExpired() ||
                'agent.beforeSpawn' !== type
              ) {
                throw new Error('Invalid policy hook registration');
              }
              handlers.push({ id, run });
            },
            cleanup(run: () => void | Promise<void>) {
              if ('cleanup' === state || 'closed' === state || activeDeadline.hasExpired()) {
                throw new Error('Policy cleanup registration has ended');
              }
              cleanups.push({ id, run });
            },
          }),
        );
        code = 'registration-contract';
        assertSynchronousRegistration(returned);
        code = 'exception';
      } finally {
        registering = false;
      }
      if (deadline.hasExpired()) {
        code = 'timeout';
        throw new Error('Policy dispatch deadline exceeded');
      }
    }
    for (const id of settings.requiredPolicies) {
      if (!handlers.some((handler) => handler.id === id)) {
        currentId = id;
        code = 'configuration-error';
        throw new Error('Required policy has no applicable handler');
      }
    }
    state = 'handler';
    for (const handler of handlers) {
      currentId = handler.id;
      if (deadline.hasExpired()) {
        code = 'timeout';
        throw new Error('Policy dispatch deadline exceeded');
      }
      const settlement = await deadline.wait(() => handler.run(request), 'handler');
      if ('timeout' === settlement.status || deadline.hasExpired()) {
        code = 'timeout';
        throw new Error('Policy dispatch deadline exceeded');
      }
      if ('rejected' === settlement.status) {
        failures.push({
          stage: 'handler',
          code: 'exception',
          middlewareId: handler.id,
          cause: settlement.cause,
        });
        break;
      }
      const decision: unknown = settlement.value;
      if (!validDecision(decision)) {
        code = 'invalid-decision';
        throw new Error('Invalid policy decision');
      }
      if ('deny' === decision.action) {
        denials.push(Object.freeze({ middlewareId: handler.id, reason: decision.reason }));
      }
    }
    if (deadline.hasExpired() && !failures.length) {
      code = 'timeout';
      throw new Error('Policy dispatch deadline exceeded');
    }
  } catch (cause) {
    failures.push({
      stage: state,
      code,
      middlewareId: currentId,
      cause,
    });
  } finally {
    state = 'cleanup';
    if (deadline) {
      for (const cleanup of cleanups.reverse()) {
        const alreadyExpired = deadline.hasExpired();
        const settlement = await deadline.wait(cleanup.run, 'cleanup');
        if ('timeout' === settlement.status || (!alreadyExpired && deadline.hasExpired())) {
          failures.push({
            stage: 'cleanup',
            code: 'timeout',
            middlewareId: cleanup.id,
            cause: new Error('Policy cleanup deadline exceeded'),
          });
        }
        if ('rejected' === settlement.status) {
          failures.push({
            stage: 'cleanup',
            code: 'exception',
            middlewareId: cleanup.id,
            cause: settlement.cause,
          });
        }
      }
    }
    state = 'closed';
    deadline?.dispose();
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
    failures: Object.freeze(failures.map((failure) => Object.freeze(failure))),
  });
}
