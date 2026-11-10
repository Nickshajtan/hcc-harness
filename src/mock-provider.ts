import type { Readable, Writable } from 'node:stream';
import type { Configuration } from './config.js';
import type { Registry } from './middleware.js';
import { dispatchPolicy, parsePolicyRequest, type PolicyResult } from './policy.js';

/** This describes only the local mock's refusal behavior, not any real provider. */
export const mockProviderCapabilities = Object.freeze({ 'agent.beforeSpawn': true });
export const maxHookBytes = 16 * 1024;
class InvalidHookInput extends Error {}

export interface MockHookOptions {
  readonly input: Readable;
  readonly output: Writable;
  readonly diagnostics: Writable;
  readonly configuration: Pick<Configuration, 'middleware'>;
  readonly registry: Registry;
  /** Trusted adapter binding, never read from the provider request. */
  readonly capabilities: { readonly 'agent.beforeSpawn': boolean };
}

async function readRequest(input: Readable): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > maxHookBytes) {
      throw new InvalidHookInput('Hook input exceeds byte limit');
    }
    chunks.push(bytes);
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as unknown;
  } catch (cause) {
    throw new InvalidHookInput('Invalid hook JSON', { cause });
  }
}

async function write(stream: Writable, text: string): Promise<void> {
  let reportError: (error: Error) => void = () => undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      reportError = reject;
      stream.once('error', reportError);
      stream.write(text, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  } finally {
    stream.removeListener('error', reportError);
  }
}

function response(result: PolicyResult): object {
  if ('invalid-request' === result.outcome) {
    return result;
  }
  return {
    outcome: result.outcome,
    requestId: result.requestId,
    // Policy reasons are trusted module diagnostics, not echoed provider payloads.
    denials: result.denials,
    failures: result.failures.map(({ stage, middlewareId }) => ({ stage, middlewareId })),
    permitted: 'allow' === result.outcome,
  };
}

/** EOF delimits exactly one JSON request. No discovery, installation or process launch. */
export async function runMockHook(options: MockHookOptions): Promise<number> {
  let input: unknown;
  let inputTransportFailed = false;
  try {
    input = await readRequest(options.input);
  } catch (error) {
    inputTransportFailed = !(error instanceof InvalidHookInput);
    input = undefined;
  }
  const request = parsePolicyRequest(input);
  let result:
    | PolicyResult
    | { outcome: 'unsupported'; requestId: string; permitted: false }
    | { outcome: 'transport-error'; permitted: false };
  if (inputTransportFailed) {
    result = { outcome: 'transport-error', permitted: false };
  } else if (!request) {
    result = { outcome: 'invalid-request' };
  } else if (!options.capabilities['agent.beforeSpawn']) {
    result = { outcome: 'unsupported', requestId: request.requestId, permitted: false };
  } else {
    result = await dispatchPolicy(request, options.configuration, options.registry);
  }
  try {
    await write(
      options.output,
      JSON.stringify(
        'unsupported' === result.outcome || 'transport-error' === result.outcome
          ? result
          : response(result),
      ) + '\n',
    );
  } catch {
    await write(options.diagnostics, '[arch mock hook] transport-error\n');
    return 5;
  }
  if ('allow' === result.outcome) {
    return 0;
  }
  await write(options.diagnostics, `[arch mock hook] ${result.outcome}\n`);
  switch (result.outcome) {
    case 'deny':
      return 1;
    case 'invalid-request':
      return 2;
    case 'policy-error':
      return 3;
    case 'unsupported':
      return 4;
    case 'transport-error':
      return 5;
  }
}
