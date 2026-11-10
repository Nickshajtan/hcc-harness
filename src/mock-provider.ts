import type { Readable, Writable } from 'node:stream';
import type { Configuration } from './config.js';
import type { Registry } from './middleware.js';
import {
  dispatchPolicy,
  parsePolicyRequest,
  resolvePolicyOptions,
  type PolicyResult,
  type PolicyDispatchOptions,
} from './policy.js';
import {
  MockTransport,
  HookTransportError,
  InvalidHookInput,
  type MockTransportOptions,
} from './mock-transport.js';
export { maxHookBytes, type MockTransportOptions } from './mock-transport.js';

/** This describes only the local mock's refusal behavior, not any real provider. */
export const mockProviderCapabilities = Object.freeze({ 'agent.beforeSpawn': true });
export interface MockHookOptions {
  readonly input: Readable;
  readonly output: Writable;
  readonly diagnostics: Writable;
  readonly configuration: Pick<Configuration, 'middleware'>;
  readonly registry: Registry;
  readonly policyOptions?: PolicyDispatchOptions;
  readonly transportOptions?: MockTransportOptions;
  /** Trusted adapter binding, never read from the provider request. */
  readonly capabilities: { readonly 'agent.beforeSpawn': boolean };
}
type AdapterRefusal =
  | { readonly outcome: 'unsupported'; readonly requestId: string; readonly permitted: false }
  | { readonly outcome: 'configuration-error'; readonly permitted: false }
  | {
      readonly outcome: 'transport-error';
      readonly permitted: false;
      readonly failure: { readonly stage: string; readonly code: string };
    };
type MockResult = PolicyResult | AdapterRefusal;

function transportFailure(error: unknown): AdapterRefusal {
  const failure =
    error instanceof HookTransportError
      ? { stage: error.stage, code: error.code }
      : { stage: 'input', code: 'transport-error' };
  return { outcome: 'transport-error', permitted: false, failure };
}

function response(result: MockResult): object {
  if (
    'allow' !== result.outcome &&
    'deny' !== result.outcome &&
    'policy-error' !== result.outcome
  ) {
    return result;
  }
  return {
    outcome: result.outcome,
    requestId: result.requestId,
    denials: result.denials,
    failures: result.failures.map(({ stage, code, middlewareId }) => ({
      stage,
      code,
      middlewareId,
    })),
    cleanup: result.cleanup,
    permitted: 'allow' === result.outcome,
  };
}

async function evaluate(options: MockHookOptions, transport: MockTransport): Promise<MockResult> {
  let input: unknown;
  try {
    input = await transport.read(options.input);
  } catch (error) {
    if (error instanceof InvalidHookInput) {
      return { outcome: 'invalid-request' };
    }
    return transportFailure(error);
  }
  const request = parsePolicyRequest(input);
  if (!request) {
    return { outcome: 'invalid-request' };
  }
  if (!options.capabilities['agent.beforeSpawn']) {
    return { outcome: 'unsupported', requestId: request.requestId, permitted: false };
  }
  try {
    const { policyOptions = {} } = options;
    const settings = resolvePolicyOptions(policyOptions);
    transport.admitPolicy(settings.timeoutMs, settings.cleanupGraceMs);
    return await dispatchPolicy(request, options.configuration, options.registry, settings);
  } catch (cause) {
    if (cause instanceof HookTransportError && 'configuration-error' !== cause.code) {
      return transportFailure(cause);
    }
    return {
      outcome: 'policy-error',
      requestId: request.requestId,
      denials: [],
      cleanup: [],
      failures: [{ stage: 'configuration', code: 'configuration-error', middlewareId: '', cause }],
    };
  }
}

function exitStatus(result: MockResult): number {
  switch (result.outcome) {
    case 'allow':
      return 0;
    case 'deny':
      return 1;
    case 'invalid-request':
      return 2;
    case 'policy-error': {
      const code = result.failures[0]?.code;
      if ('timeout' === code || 'cleanup-skipped' === code) {
        return 6;
      }
      if ('configuration-error' === code) {
        return 7;
      }
      return 3;
    }
    case 'unsupported':
      return 4;
    case 'transport-error':
      return 5;
    case 'configuration-error':
      return 7;
  }
}

/** Exactly one EOF-framed request and at most one JSON output attempt. */
export async function runMockHook(options: MockHookOptions): Promise<number> {
  let transport: MockTransport;
  let result: MockResult | undefined;
  try {
    transport = new MockTransport(options.transportOptions);
  } catch {
    // Invalid trusted limits cannot disable bounded reporting of configuration failure.
    transport = new MockTransport();
    result = { outcome: 'configuration-error', permitted: false };
  }
  result ??= await evaluate(options, transport);
  try {
    await transport.deliver(options.output, response(result));
  } catch (error) {
    const code = error instanceof HookTransportError ? error.code : 'transport-error';
    try {
      await transport.report(options.diagnostics, code);
    } catch {
      /* no recursive reporting */
    }
    return 5;
  }
  const status = exitStatus(result);
  if (0 !== status) {
    const diagnostic = 'transport-error' === result.outcome ? result.failure.code : result.outcome;
    try {
      await transport.report(options.diagnostics, diagnostic);
    } catch {
      return 5;
    }
  }
  return status;
}
