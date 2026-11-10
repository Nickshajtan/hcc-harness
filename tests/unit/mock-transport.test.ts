import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import {
  runMockHook,
  mockProviderCapabilities,
  type MockHookOptions,
} from '../../src/mock-provider.js';
import { MockTransport, HookTransportError } from '../../src/mock-transport.js';
import type { Registry } from '../../src/middleware.js';

const request = { type: 'agent.beforeSpawn', provider: 'mock', requestId: 'transport' };
function capture() {
  let text = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });
  return { stream, text: () => text };
}
function fixture(input: Readable = Readable.from([JSON.stringify(request)])) {
  const output = capture(),
    diagnostics = capture();
  const factory = vi.fn();
  const registry: Registry = new Map([
    [
      'required',
      () => {
        factory();
        return {
          id: 'required',
          register: () => undefined,
          registerPolicy(api) {
            api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
          },
        };
      },
    ],
  ]);
  const options: MockHookOptions = {
    input,
    output: output.stream,
    diagnostics: diagnostics.stream,
    registry,
    configuration: { middleware: [{ id: 'required', enabled: true }] },
    capabilities: mockProviderCapabilities,
    policyOptions: { requiredPolicies: ['required'], timeoutMs: 20, cleanupGraceMs: 10 },
    transportOptions: {
      timeoutMs: 100,
      inputTimeoutMs: 10,
      outputTimeoutMs: 10,
      diagnosticTimeoutMs: 5,
    },
  };
  return { options, output, diagnostics, factory };
}
async function finish(pending: Promise<number>, ms: number) {
  const done = vi.fn();
  void pending.then(done);
  await vi.advanceTimersByTimeAsync(ms);
  expect(done).toHaveBeenCalledTimes(1);
  return pending;
}
function released(stream: Readable | Writable, errors = 0) {
  expect(stream.listenerCount('error')).toBe(errors);
  expect(stream.listenerCount('close')).toBe(0);
}

it('accepts inclusive transport limits and an exactly fitting policy reservation', () => {
  const transport = new MockTransport({
    timeoutMs: 120_000,
    inputTimeoutMs: 1,
    outputTimeoutMs: 1,
    diagnosticTimeoutMs: 1,
  });
  expect(() => {
    transport.admitPolicy(119_996, 1);
  }).not.toThrow();
  vi.advanceTimersByTime(1);
  expect(() => {
    transport.admitPolicy(119_996, 1);
  }).not.toThrow();
  vi.advanceTimersByTime(1);
  expect(() => {
    transport.admitPolicy(119_996, 1);
  }).toThrow(expect.objectContaining({ stage: 'policy-admission', code: 'adapter-timeout' }));
  expect(
    () =>
      new MockTransport({
        timeoutMs: 3,
        inputTimeoutMs: 1,
        outputTimeoutMs: 1,
        diagnosticTimeoutMs: 1,
      }),
  ).not.toThrow();
});

it('includes both output and diagnostic reserves when admitting policy', () => {
  const transport = new MockTransport({
    timeoutMs: 50,
    inputTimeoutMs: 10,
    outputTimeoutMs: 10,
    diagnosticTimeoutMs: 5,
  });
  expect(() => {
    transport.admitPolicy(25, 5);
  }).toThrow(
    expect.objectContaining({
      stage: 'configuration',
      code: 'configuration-error',
      message: 'Mock hook configuration-error',
    }),
  );
});

it('uses the input phase duration and remaining absolute budget, including exact boundaries', async () => {
  const transport = new MockTransport({
    timeoutMs: 50,
    inputTimeoutMs: 10,
    outputTimeoutMs: 10,
    diagnosticTimeoutMs: 5,
  });
  vi.advanceTimersByTime(5);
  const input = new Readable({ read: () => undefined });
  const pending = transport.read(input).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(9);
  expect(input.listenerCount('data')).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toMatchObject({ stage: 'input', code: 'input-timeout' });
  released(input);
  vi.advanceTimersByTime(30);
  await expect(transport.read(input)).rejects.toMatchObject({
    stage: 'input',
    code: 'input-timeout',
  });
  input.destroy();
});

it('reports the diagnostic phase independently of output failures', async () => {
  const transport = new MockTransport({
    timeoutMs: 50,
    inputTimeoutMs: 10,
    outputTimeoutMs: 10,
    diagnosticTimeoutMs: 5,
  });
  const diagnostics = new Writable({ write: () => undefined });
  const pending = transport.report(diagnostics, 'refusal').catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(5);
  expect(await pending).toMatchObject({ stage: 'diagnostics', code: 'diagnostic-timeout' });
  released(diagnostics);
  diagnostics.destroy();
});

it('fails an already destroyed input immediately rather than waiting for its timer', async () => {
  const input = new Readable({ read: () => undefined });
  input.destroy();
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  await expect(new MockTransport().read(input)).rejects.toMatchObject({
    stage: 'input',
    code: 'transport-error',
  });
  released(input);
});

it('resumes input that its owner initially paused', async () => {
  const input = Readable.from([JSON.stringify(request)]);
  input.pause();
  expect(await new MockTransport().read(input)).toEqual(request);
  released(input);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it('delivers a complete EOF-framed allow only after the write callback', async () => {
  const { options, factory } = fixture();
  let complete: () => void = () => undefined;
  const write = vi.fn((_chunk: Buffer, _encoding: BufferEncoding, callback: () => void) => {
    complete = callback;
  });
  const output = new Writable({ write });
  const done = vi.fn();
  const pending = runMockHook({ ...options, output });
  void pending.then(done);
  await vi.advanceTimersByTimeAsync(0);
  expect(done).not.toHaveBeenCalled();
  expect(factory).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(9);
  complete();
  expect(await finish(pending, 0)).toBe(0);
  expect(write).toHaveBeenCalledTimes(1);
  released(output);
  released(options.input);
  expect(options.input.listenerCount('data')).toBe(0);
  expect(options.input.listenerCount('end')).toBe(0);
});

it.each(['', '{', JSON.stringify(request)])(
  'refuses open stdin without EOF %# before instantiating middleware',
  async (partial) => {
    const input = new Readable({ read: () => undefined });
    const { options, output, diagnostics, factory } = fixture(input);
    const pending = runMockHook(options);
    if (partial) {
      input.push(partial);
    }
    expect(await finish(pending, 10)).toBe(5);
    expect(JSON.parse(output.text())).toEqual({
      outcome: 'transport-error',
      permitted: false,
      failure: { stage: 'input', code: 'input-timeout' },
    });
    expect(diagnostics.text()).toBe('[arch mock hook] input-timeout\n');
    expect(factory).not.toHaveBeenCalled();
    expect(input.destroyed).toBe(false);
    expect(input.isPaused()).toBe(true);
    released(input);
    expect(input.listenerCount('data')).toBe(0);
    expect(input.listenerCount('end')).toBe(0);
    input.push(JSON.stringify(request));
    input.push(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(factory).not.toHaveBeenCalled();
    expect(output.text().trim().split('\n')).toHaveLength(1);
    input.destroy();
  },
);

it.each([
  Buffer.from([0xff]),
  Buffer.from('{}\n{}'),
  Buffer.from('{'),
  Buffer.alloc(16 * 1024 + 1, 32),
])('rejects invalid encoding, JSON or oversize input %#', async (input) => {
  const { options, output, factory } = fixture(Readable.from([input]));
  expect(await runMockHook(options)).toBe(2);
  expect(JSON.parse(output.text())).toEqual({ outcome: 'invalid-request' });
  expect(factory).not.toHaveBeenCalled();
  released(options.input);
});

it('rejects oversized input immediately without waiting for EOF', async () => {
  const input = new Readable({ read: () => undefined });
  const { options, factory } = fixture(input);
  const pending = runMockHook(options);
  input.push(Buffer.alloc(16 * 1024 + 1));
  expect(await finish(pending, 0)).toBe(2);
  expect(factory).not.toHaveBeenCalled();
  expect(input.destroyed).toBe(false);
  input.destroy();
});

it('classifies an input stream error and releases only adapter listeners', async () => {
  const input = new Readable({ read: () => undefined });
  const owner = vi.fn();
  input.on('error', owner);
  const { options, output, factory } = fixture(input);
  const pending = runMockHook(options);
  input.emit('error', new Error('sensitive source detail'));
  expect(await finish(pending, 0)).toBe(5);
  expect(JSON.parse(output.text())).toEqual({
    outcome: 'transport-error',
    permitted: false,
    failure: { stage: 'input', code: 'transport-error' },
  });
  expect(output.text()).not.toContain('sensitive');
  expect(factory).not.toHaveBeenCalled();
  released(input, 1);
  input.emit('error', new Error('late owner event'));
  expect(owner).toHaveBeenCalledTimes(2);
  input.destroy();
});

it('refuses a prematurely closed input without invoking middleware', async () => {
  const input = new Readable({ read: () => undefined });
  const { options, output, factory } = fixture(input);
  const pending = runMockHook(options);
  input.destroy();
  expect(await finish(pending, 0)).toBe(5);
  expect(JSON.parse(output.text())).toMatchObject({ outcome: 'transport-error', permitted: false });
  expect(factory).not.toHaveBeenCalled();
  released(input);
});

it('times out a write even when write() accepted the buffer, without retrying authorization', async () => {
  const { options, diagnostics } = fixture();
  let complete: (error?: Error | null) => void = () => undefined;
  const write = vi.fn(
    (_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
      complete = callback;
    },
  );
  const output = new Writable({ write });
  const pending = runMockHook({ ...options, output });
  expect(await finish(pending, 10)).toBe(5);
  expect(diagnostics.text()).toBe('[arch mock hook] output-timeout\n');
  expect(output.destroyed).toBe(false);
  expect(write).toHaveBeenCalledTimes(1);
  released(output);
  complete();
  await vi.advanceTimersByTimeAsync(0);
  expect(write).toHaveBeenCalledTimes(1);
  expect(await pending).toBe(5);
});

it('contains a late write callback error after its timeout without retaining a stalled-stream listener', async () => {
  const { options } = fixture();
  let complete: (error?: Error | null) => void = () => undefined;
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      complete = callback;
    },
  });
  const owner = vi.fn();
  output.on('error', owner);
  const pending = runMockHook({ ...options, output });
  expect(await finish(pending, 10)).toBe(5);
  released(output, 1);
  complete(new Error('late output error'));
  expect(output.listenerCount('error')).toBe(2);
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  released(output, 1);
  expect(owner).toHaveBeenCalledTimes(1);
  expect(await pending).toBe(5);
});

it('refuses emitted writable errors and releases its listeners', async () => {
  const { options, diagnostics } = fixture();
  const output = new Writable({ write: () => undefined });
  const pending = runMockHook({ ...options, output });
  await vi.advanceTimersByTimeAsync(0);
  output.emit('error', new Error('write failed'));
  expect(await finish(pending, 0)).toBe(5);
  expect(diagnostics.text()).toBe('[arch mock hook] transport-error\n');
  released(output);
  output.destroy();
});

it('does not retry partial JSON output after callback failure', async () => {
  const { options, diagnostics } = fixture();
  let partial = '';
  const write = vi.fn(
    (chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
      partial += chunk.toString().slice(0, 8);
      callback(new Error('partial delivery'));
    },
  );
  const output = new Writable({ write });
  const owner = vi.fn();
  output.on('error', owner);
  expect(await runMockHook({ ...options, output })).toBe(5);
  expect(() => JSON.parse(partial) as unknown).toThrow();
  expect(write).toHaveBeenCalledTimes(1);
  expect(diagnostics.text()).toBe('[arch mock hook] transport-error\n');
  released(output, 1);
});

it.each(['hang', 'error'] as const)(
  'bounds diagnostic stream %s and never converts refusal to success',
  async (mode) => {
    const { options, output } = fixture(Readable.from(['{}']));
    const diagnostics = new Writable({
      write(_chunk, _encoding, callback) {
        if ('error' === mode) {
          callback(new Error('diagnostics unavailable'));
        }
      },
    });
    diagnostics.on('error', () => undefined);
    const pending = runMockHook({ ...options, diagnostics });
    expect(await finish(pending, 5)).toBe(5);
    expect(JSON.parse(output.text())).toEqual({ outcome: 'invalid-request' });
    released(diagnostics, 1);
    diagnostics.destroy();
  },
);

it('shares the absolute adapter end with diagnostics after stalled output', async () => {
  const { options } = fixture();
  const output = new Writable({ write: () => undefined });
  const diagnostics = new Writable({ write: () => undefined });
  const pending = runMockHook({ ...options, output, diagnostics });
  expect(await finish(pending, 15)).toBe(5);
  released(output);
  released(diagnostics);
  output.destroy();
  diagnostics.destroy();
});

it.each([0, -1, null, NaN, Infinity, 0.5, 120_001])(
  'rejects invalid trusted transport timing %# without reading stdin',
  async (timeoutMs) => {
    const input = new Readable({ read: () => undefined });
    const { options, output, factory } = fixture(input);
    expect(
      await runMockHook({
        ...options,
        transportOptions: { timeoutMs } as NonNullable<MockHookOptions['transportOptions']>,
      }),
    ).toBe(7);
    expect(JSON.parse(output.text())).toEqual({ outcome: 'configuration-error', permitted: false });
    expect(factory).not.toHaveBeenCalled();
    expect(input.listenerCount('data')).toBe(0);
    input.destroy();
  },
);

it('refuses a configuration whose policy and transport reservations do not fit', async () => {
  const { options, output, factory } = fixture();
  expect(
    await runMockHook({
      ...options,
      transportOptions: { ...options.transportOptions, timeoutMs: 40 },
    }),
  ).toBe(7);
  expect(JSON.parse(output.text())).toMatchObject({
    outcome: 'policy-error',
    permitted: false,
    failures: [{ code: 'configuration-error', stage: 'configuration' }],
  });
  expect(factory).not.toHaveBeenCalled();
});

it('does not instantiate policies when adapter overhead consumed their reserved window', async () => {
  const { options, output, factory } = fixture();
  const clock = vi.spyOn(performance, 'now');
  try {
    const capabilities = {
      get 'agent.beforeSpawn'() {
        clock.mockReturnValue(80);
        return true;
      },
    };
    expect(await runMockHook({ ...options, capabilities })).toBe(5);
    expect(JSON.parse(output.text())).toEqual({
      outcome: 'transport-error',
      permitted: false,
      failure: { code: 'adapter-timeout', stage: 'policy-admission' },
    });
    expect(factory).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
});

it('includes serialization time in the output window and never writes after expiry', async () => {
  const transport = new MockTransport({
    timeoutMs: 100,
    inputTimeoutMs: 10,
    outputTimeoutMs: 10,
    diagnosticTimeoutMs: 5,
  });
  const output = capture();
  const value = {
    toJSON() {
      vi.advanceTimersByTime(10);
      return { permitted: true };
    },
  };
  await expect(transport.deliver(output.stream, value)).rejects.toMatchObject({
    code: 'output-timeout',
  });
  expect(output.text()).toBe('');
  released(output.stream);
});

it('classifies serialization errors without writing a partial response', async () => {
  const transport = new MockTransport();
  const output = capture();
  await expect(
    transport.deliver(output.stream, {
      toJSON() {
        throw new Error('sensitive');
      },
    }),
  ).rejects.toMatchObject({ code: 'serialization-error', stage: 'output' });
  expect(output.text()).toBe('');
});

it('constrains output and diagnostics by the original overall adapter deadline', async () => {
  const transport = new MockTransport({
    timeoutMs: 30,
    inputTimeoutMs: 10,
    outputTimeoutMs: 10,
    diagnosticTimeoutMs: 10,
  });
  const output = capture(),
    diagnostics = new Writable({ write: () => undefined });
  await vi.advanceTimersByTimeAsync(25);
  await expect(transport.deliver(output.stream, { permitted: true })).rejects.toMatchObject({
    code: 'output-timeout',
  });
  const pending = transport.report(diagnostics, 'transport-error').catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(5);
  expect(await pending).toBeInstanceOf(HookTransportError);
  expect(await pending).toMatchObject({ code: 'diagnostic-timeout' });
  expect(output.text()).toBe('');
  released(diagnostics);
  diagnostics.destroy();
});

it('validates phase limits and their sum rather than accepting a disabled transport deadline', async () => {
  for (const transportOptions of [
    { inputTimeoutMs: 0 },
    { outputTimeoutMs: NaN },
    { diagnosticTimeoutMs: null },
    { timeoutMs: 20, inputTimeoutMs: 10, outputTimeoutMs: 10, diagnosticTimeoutMs: 5 },
  ]) {
    const { options, output, factory } = fixture();
    expect(
      await runMockHook({
        ...options,
        transportOptions: transportOptions as NonNullable<MockHookOptions['transportOptions']>,
      }),
    ).toBe(7);
    expect(JSON.parse(output.text())).toEqual({ outcome: 'configuration-error', permitted: false });
    expect(factory).not.toHaveBeenCalled();
  }
});

it('refuses input whose deadline elapsed before the read started', async () => {
  const transport = new MockTransport({
    timeoutMs: 30,
    inputTimeoutMs: 10,
    outputTimeoutMs: 10,
    diagnosticTimeoutMs: 10,
  });
  const input = new Readable({ read: () => undefined });
  await vi.advanceTimersByTimeAsync(30);
  await expect(transport.read(input)).rejects.toMatchObject({
    stage: 'input',
    code: 'input-timeout',
  });
  expect(input.listenerCount('data')).toBe(0);
  input.destroy();
});

it.each(['data', 'end'] as const)(
  'checks monotonic time on input %s even if timer delivery was delayed',
  async (event) => {
    const transport = new MockTransport({
      timeoutMs: 100,
      inputTimeoutMs: 10,
      outputTimeoutMs: 10,
      diagnosticTimeoutMs: 5,
    });
    const input = new Readable({ read: () => undefined });
    const observed = transport.read(input).catch((error: unknown) => error);
    const clock = vi.spyOn(performance, 'now').mockReturnValue(10);
    try {
      if ('data' === event) {
        input.emit('data', Buffer.from('{}'));
      } else {
        input.emit('end');
      }
      expect(await observed).toMatchObject({ code: 'input-timeout', stage: 'input' });
      released(input);
    } finally {
      clock.mockRestore();
      input.destroy();
    }
  },
);

it('does not accept parsed input after its read budget was consumed by serialization overhead', async () => {
  const transport = new MockTransport({
    timeoutMs: 100,
    inputTimeoutMs: 10,
    outputTimeoutMs: 10,
    diagnosticTimeoutMs: 5,
  });
  const input = new Readable({ read: () => undefined });
  const observed = transport.read(input).catch((error: unknown) => error);
  const clock = vi.spyOn(performance, 'now');
  const parse = vi.spyOn(JSON, 'parse').mockImplementation((): unknown => {
    clock.mockReturnValue(10);
    return request;
  });
  try {
    input.emit('end');
    expect(await observed).toMatchObject({ code: 'input-timeout' });
  } finally {
    parse.mockRestore();
    clock.mockRestore();
    input.destroy();
  }
});

it('rejects non-byte chunks instead of coercing arbitrary stream objects', async () => {
  const { options, output } = fixture(
    Readable.from([{ secret: 'do not stringify' }], { objectMode: true }),
  );
  expect(await runMockHook(options)).toBe(5);
  expect(JSON.parse(output.text())).toMatchObject({ outcome: 'transport-error', permitted: false });
  expect(output.text()).not.toContain('secret');
  released(options.input);
});

it('handles an already ended or destroyed input without leaving listeners behind', async () => {
  const ended = Readable.from([]);
  const endedEvent = new Promise<void>((resolve) => {
    ended.once('end', resolve);
  });
  ended.resume();
  await endedEvent;
  const endedFixture = fixture(ended);
  expect(await runMockHook(endedFixture.options)).toBe(2);
  released(ended);
  const destroyed = new Readable({ read: () => undefined });
  destroyed.destroy();
  const destroyedFixture = fixture(destroyed);
  expect(await runMockHook(destroyedFixture.options)).toBe(5);
  released(destroyed);
});

it('treats an undefined serialization result as an error without writing', async () => {
  const transport = new MockTransport(),
    output = capture();
  await expect(transport.deliver(output.stream, { toJSON: () => undefined })).rejects.toMatchObject(
    { code: 'serialization-error' },
  );
  expect(output.text()).toBe('');
});

it('rejects a callback delivered after its output window even when timer delivery was delayed', async () => {
  const transport = new MockTransport({
    timeoutMs: 100,
    inputTimeoutMs: 10,
    outputTimeoutMs: 10,
    diagnosticTimeoutMs: 5,
  });
  const clock = vi.spyOn(performance, 'now');
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      clock.mockReturnValue(10);
      callback();
    },
  });
  try {
    await expect(transport.deliver(output, { permitted: true })).rejects.toMatchObject({
      code: 'output-timeout',
    });
    released(output);
  } finally {
    clock.mockRestore();
  }
});

it('handles synchronous write exceptions and ended writable streams as transport failures', async () => {
  const transport = new MockTransport();
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const write = vi.spyOn(output, 'write').mockImplementation(() => {
    throw new Error('write threw');
  });
  await expect(transport.deliver(output, { permitted: true })).rejects.toMatchObject({
    code: 'transport-error',
  });
  released(output);
  write.mockRestore();
  const ended = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const finished = new Promise<void>((resolve) => {
    ended.once('finish', resolve);
  });
  ended.end();
  await finished;
  await expect(transport.deliver(ended, { permitted: true })).rejects.toMatchObject({
    code: 'transport-error',
  });
  released(ended);
});

it('ignores stale event callbacks after settlement without changing the result', async () => {
  const transport = new MockTransport();
  const input = new Readable({ read: () => undefined });
  const pending = transport.read(input).catch((error: unknown) => error);
  const retained = input.listeners('error')[0] as (error: Error) => void;
  input.emit('error', new Error('first'));
  retained(new Error('stale'));
  expect(await pending).toMatchObject({ code: 'transport-error' });
  released(input);
  input.destroy();
  const output = new Writable({ write: () => undefined });
  const writing = transport.deliver(output, {}).catch((error: unknown) => error);
  const late = output.listeners('close')[0] as () => void;
  output.emit('close');
  late();
  expect(await writing).toMatchObject({ code: 'transport-error' });
  released(output);
  output.destroy();
});

it.each([null, [], false, 'disabled', 42, { unknownLimit: 10 }])(
  'rejects malformed transport options %# before reading a request',
  async (transportOptions) => {
    const input = new Readable({ read: () => undefined });
    const { options, output, factory } = fixture(input);
    expect(
      await runMockHook({
        ...options,
        transportOptions: transportOptions as NonNullable<MockHookOptions['transportOptions']>,
      }),
    ).toBe(7);
    expect(JSON.parse(output.text())).toEqual({ outcome: 'configuration-error', permitted: false });
    expect(factory).not.toHaveBeenCalled();
    expect(input.listenerCount('data')).toBe(0);
    input.destroy();
  },
);

it('rejects provider-supplied transport limits instead of using them', async () => {
  const { options, output, factory } = fixture(
    Readable.from([JSON.stringify({ ...request, transportOptions: { timeoutMs: 0 } })]),
  );
  expect(await runMockHook(options)).toBe(2);
  expect(JSON.parse(output.text())).toEqual({ outcome: 'invalid-request' });
  expect(factory).not.toHaveBeenCalled();
});

it('keeps concurrent input deadlines and listener ownership independent', async () => {
  const firstInput = new Readable({ read: () => undefined }),
    secondInput = new Readable({ read: () => undefined });
  const first = fixture(firstInput),
    second = fixture(secondInput);
  const early = runMockHook({
    ...first.options,
    transportOptions: { ...first.options.transportOptions, inputTimeoutMs: 5 },
  });
  const later = runMockHook({
    ...second.options,
    transportOptions: { ...second.options.transportOptions, inputTimeoutMs: 15 },
  });
  expect(await finish(early, 5)).toBe(5);
  released(firstInput);
  expect(secondInput.listenerCount('data')).toBe(1);
  expect(await finish(later, 10)).toBe(5);
  released(secondInput);
  expect(first.factory).not.toHaveBeenCalled();
  expect(second.factory).not.toHaveBeenCalled();
  firstInput.destroy();
  secondInput.destroy();
});
