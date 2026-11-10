import type { Readable, Writable } from 'node:stream';

export const maxHookBytes = 16 * 1024;
export interface MockTransportOptions {
  readonly timeoutMs?: number;
  readonly inputTimeoutMs?: number;
  readonly outputTimeoutMs?: number;
  readonly diagnosticTimeoutMs?: number;
}
type TransportStage = 'input' | 'output' | 'diagnostics' | 'policy-admission' | 'configuration';
type TransportCode =
  | 'input-timeout'
  | 'output-timeout'
  | 'diagnostic-timeout'
  | 'adapter-timeout'
  | 'transport-error'
  | 'serialization-error'
  | 'configuration-error';

export class HookTransportError extends Error {
  constructor(
    readonly stage: TransportStage,
    readonly code: TransportCode,
  ) {
    super(`Mock hook ${code}`);
  }
}
export class InvalidHookInput extends Error {}

function limits(options: unknown) {
  if (
    null === options ||
    'object' !== typeof options ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) =>
        !['timeoutMs', 'inputTimeoutMs', 'outputTimeoutMs', 'diagnosticTimeoutMs'].includes(key),
    )
  ) {
    throw new HookTransportError('configuration', 'configuration-error');
  }
  const {
    timeoutMs = 10_000,
    inputTimeoutMs = 1000,
    outputTimeoutMs = 1000,
    diagnosticTimeoutMs = 100,
  } = options as MockTransportOptions;
  for (const value of [timeoutMs, inputTimeoutMs, outputTimeoutMs, diagnosticTimeoutMs]) {
    if (!Number.isInteger(value) || 1 > value || 120_000 < value) {
      throw new HookTransportError('configuration', 'configuration-error');
    }
  }
  if (timeoutMs < inputTimeoutMs + outputTimeoutMs + diagnosticTimeoutMs) {
    throw new HookTransportError('configuration', 'configuration-error');
  }
  return { timeoutMs, inputTimeoutMs, outputTimeoutMs, diagnosticTimeoutMs };
}

// Node may emit a write-callback error after that callback returns, even after timeout.
// Contain that owned error for this turn only; do not retain listeners on a stalled stream.
function containCallbackError(stream: Writable): void {
  const release = () => {
    stream.removeListener('error', release);
    clearImmediate(turn);
  };
  const turn = setImmediate(release);
  stream.once('error', release);
}

/** The mock adapter owns this budget; it never changes an Arch process deadline. */
export class MockTransport {
  private readonly settings;
  private readonly expiresAt: number;

  constructor(options: MockTransportOptions = {}) {
    this.settings = limits(options);
    this.expiresAt = performance.now() + this.settings.timeoutMs;
  }

  admitPolicy(timeoutMs: number, cleanupGraceMs: number): void {
    const policyMs = timeoutMs + cleanupGraceMs;
    const reserved = this.settings.outputTimeoutMs + this.settings.diagnosticTimeoutMs;
    if (this.settings.timeoutMs < this.settings.inputTimeoutMs + policyMs + reserved) {
      throw new HookTransportError('configuration', 'configuration-error');
    }
    if (this.expiresAt - performance.now() < policyMs + reserved) {
      throw new HookTransportError('policy-admission', 'adapter-timeout');
    }
  }

  private window(stage: 'input' | 'output' | 'diagnostics'): number {
    let limit = this.settings.diagnosticTimeoutMs;
    let reserve = 0;
    if ('input' === stage) {
      limit = this.settings.inputTimeoutMs;
      reserve = this.settings.diagnosticTimeoutMs;
    } else if ('output' === stage) {
      limit = this.settings.outputTimeoutMs;
      reserve = this.settings.diagnosticTimeoutMs;
    }
    return Math.min(this.expiresAt - reserve, performance.now() + limit);
  }

  read(input: Readable): Promise<unknown> {
    const end = this.window('input');
    if (performance.now() >= end) {
      return Promise.reject(new HookTransportError('input', 'input-timeout'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let size = 0;
      const chunks: Buffer[] = [];
      const release = () => {
        clearTimeout(timer);
        input.removeListener('data', onData);
        input.removeListener('end', onEnd);
        input.removeListener('error', onError);
        input.removeListener('close', onClose);
        input.pause();
      };
      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        release();
        reject(error);
      };
      const onError = () => {
        fail(new HookTransportError('input', 'transport-error'));
      };
      const onClose = () => {
        fail(new HookTransportError('input', 'transport-error'));
      };
      const onData = (chunk: unknown) => {
        if (performance.now() >= end) {
          fail(new HookTransportError('input', 'input-timeout'));
          return;
        }
        if (!Buffer.isBuffer(chunk) && 'string' !== typeof chunk) {
          fail(new HookTransportError('input', 'transport-error'));
          return;
        }
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > maxHookBytes) {
          fail(new InvalidHookInput('Hook input exceeds byte limit'));
          return;
        }
        chunks.push(bytes);
      };
      const onEnd = () => {
        if (performance.now() >= end) {
          fail(new HookTransportError('input', 'input-timeout'));
          return;
        }
        let value: unknown;
        try {
          value = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
          ) as unknown;
        } catch {
          fail(new InvalidHookInput('Invalid hook JSON'));
          return;
        }
        if (performance.now() >= end) {
          fail(new HookTransportError('input', 'input-timeout'));
          return;
        }
        settled = true;
        release();
        resolve(value);
      };
      const timer = setTimeout(
        () => {
          fail(new HookTransportError('input', 'input-timeout'));
        },
        Math.max(0, Math.ceil(end - performance.now())),
      );
      input.on('data', onData);
      input.once('end', onEnd);
      input.once('error', onError);
      input.once('close', onClose);
      if (input.readableEnded) {
        onEnd();
      } else if (input.destroyed) {
        onClose();
      } else {
        input.resume();
      }
    });
  }

  deliver(output: Writable, value: object): Promise<void> {
    const end = this.window('output');
    let text: string;
    try {
      const serialized: unknown = JSON.stringify(value);
      if ('string' !== typeof serialized) {
        throw new Error('Response is not JSON');
      }
      text = serialized + '\n';
    } catch {
      return Promise.reject(new HookTransportError('output', 'serialization-error'));
    }
    return this.write(output, text, end, 'output');
  }

  report(diagnostics: Writable, message: string): Promise<void> {
    return this.write(
      diagnostics,
      `[arch mock hook] ${message}\n`,
      this.window('diagnostics'),
      'diagnostics',
    );
  }

  private write(
    stream: Writable,
    text: string,
    end: number,
    stage: 'output' | 'diagnostics',
  ): Promise<void> {
    const timeout = () =>
      new HookTransportError(stage, 'output' === stage ? 'output-timeout' : 'diagnostic-timeout');
    if (performance.now() >= end) {
      return Promise.reject(timeout());
    }
    if (stream.destroyed || stream.writableEnded) {
      return Promise.reject(new HookTransportError(stage, 'transport-error'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const release = () => {
        clearTimeout(timer);
        stream.removeListener('error', onError);
        stream.removeListener('close', onError);
      };
      const fail = (error: HookTransportError) => {
        if (settled) {
          return;
        }
        settled = true;
        release();
        reject(error);
      };
      const onError = () => {
        fail(new HookTransportError(stage, 'transport-error'));
      };
      const timer = setTimeout(
        () => {
          fail(timeout());
        },
        Math.max(0, Math.ceil(end - performance.now())),
      );
      stream.once('error', onError);
      stream.once('close', onError);
      try {
        stream.write(text, (error) => {
          if (error) {
            containCallbackError(stream);
          }
          if (settled) {
            return;
          }
          if (error) {
            onError();
          } else if (performance.now() >= end) {
            fail(timeout());
          } else {
            settled = true;
            release();
            resolve();
          }
        });
      } catch {
        onError();
      }
    });
  }
}
