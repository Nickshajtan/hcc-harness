import { expect, it, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import {
  mockProviderCapabilities,
  runMockHook,
  type MockHookOptions,
} from '../../src/mock-provider.js';
import type { Registry } from '../../src/middleware.js';

const request = { type: 'agent.beforeSpawn', provider: 'mock', requestId: 'one' };
function capture() {
  let text = '';
  return {
    stream: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        text += chunk.toString();
        callback();
      },
    }),
    text: () => text,
  };
}
function options(input: unknown, registry: Registry = new Map()) {
  const output = capture(),
    diagnostics = capture();
  const settings: MockHookOptions = {
    input: Readable.from([JSON.stringify(input)]),
    output: output.stream,
    diagnostics: diagnostics.stream,
    configuration: { middleware: [...registry.keys()].map((id) => ({ id, enabled: true })) },
    registry,
    capabilities: mockProviderCapabilities,
  };
  return { settings, output, diagnostics };
}

it('reports unsupported capability before instantiation and rejects self-declared capability', async () => {
  const factory = vi.fn();
  const { settings, output, diagnostics } = options(request, new Map([['local', factory]]));
  expect(await runMockHook({ ...settings, capabilities: { 'agent.beforeSpawn': false } })).toBe(4);
  expect(JSON.parse(output.text())).toEqual({
    outcome: 'unsupported',
    requestId: 'one',
    permitted: false,
  });
  expect(diagnostics.text()).toContain('unsupported');
  expect(factory).not.toHaveBeenCalled();
  const spoofed = options({ ...request, capabilities: { 'agent.beforeSpawn': true } });
  expect(await runMockHook(spoofed.settings)).toBe(2);
});

it('cleans policy resources before reporting output failure, including unsupported output failure', async () => {
  const cleanup = vi.fn();
  const registry: Registry = new Map([
    [
      'local',
      () => ({
        id: 'local',
        register: () => undefined,
        registerPolicy(api) {
          api.cleanup(cleanup);
          api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
        },
      }),
    ],
  ]);
  for (const enforceable of [true, false]) {
    const { settings, diagnostics } = options(request, registry);
    const listenerCounts: number[] = [];
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        listenerCounts.push(this.listenerCount('error'));
        callback(new Error('private transport detail'));
      },
    });
    // Keep mutant-induced removal of the engine listener observable without crashing the runner.
    output.on('error', () => undefined);
    expect(
      await runMockHook({
        ...settings,
        output,
        capabilities: { 'agent.beforeSpawn': enforceable },
      }),
    ).toBe(5);
    expect(diagnostics.text()).toBe('[arch mock hook] transport-error\n');
    expect(listenerCounts).toEqual([2]);
    expect(output.listenerCount('error')).toBe(1);
  }
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('serializes policy failures without raw exception or request payload', async () => {
  const { settings, output, diagnostics } = options(
    request,
    new Map([
      [
        'broken',
        () => ({
          id: 'broken',
          register: () => undefined,
          registerPolicy(api) {
            api.on('agent.beforeSpawn', () => {
              throw new Error('secret');
            });
          },
        }),
      ],
    ]),
  );
  expect(await runMockHook(settings)).toBe(3);
  expect(JSON.parse(output.text())).toEqual({
    outcome: 'policy-error',
    requestId: 'one',
    permitted: false,
    denials: [],
    failures: [{ stage: 'handler', code: 'exception', middlewareId: 'broken' }],
  });
  expect(diagnostics.text()).toContain('policy-error');
  expect(output.text()).not.toContain('secret');
});

it('writes one allow response without diagnostics', async () => {
  const { settings, output, diagnostics } = options(request);
  expect(await runMockHook(settings)).toBe(0);
  expect(JSON.parse(output.text())).toEqual({
    outcome: 'allow',
    requestId: 'one',
    denials: [],
    failures: [],
    permitted: true,
  });
  expect(diagnostics.text()).toBe('');
});

it.each(['{', 'x'.repeat(16 * 1024 + 1), '{}', Buffer.from([0xff])])(
  'rejects invalid bounded input %#',
  async (input) => {
    const { settings, output, diagnostics } = options(request);
    expect(await runMockHook({ ...settings, input: Readable.from([input]) })).toBe(2);
    expect(JSON.parse(output.text())).toEqual({ outcome: 'invalid-request' });
    expect(diagnostics.text()).toContain('invalid-request');
  },
);

it('enforces the byte limit even for valid JSON with padding across chunks', async () => {
  const json = JSON.stringify(request);
  const atLimit = json + ' '.repeat(16 * 1024 - Buffer.byteLength(json));
  for (const extra of ['', ' ']) {
    const { settings, output } = options(request);
    const input = Readable.from([
      Buffer.from(atLimit.slice(0, 100)),
      Buffer.from(atLimit.slice(100) + extra),
    ]);
    expect(await runMockHook({ ...settings, input })).toBe('' === extra ? 0 : 2);
    expect(output.text().endsWith('\n')).toBe(true);
  }
});

it('rejects invalid requests before checking unsupported enforcement', async () => {
  const { settings, output } = options({});
  expect(await runMockHook({ ...settings, capabilities: { 'agent.beforeSpawn': false } })).toBe(2);
  expect(JSON.parse(output.text())).toEqual({ outcome: 'invalid-request' });
});

it('handles an already destroyed output and removes its temporary listener', async () => {
  const { settings, diagnostics } = options(request);
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  output.destroy();
  expect(await runMockHook({ ...settings, output })).toBe(5);
  expect(diagnostics.text()).toBe('[arch mock hook] transport-error\n');
  expect(output.listenerCount('error')).toBe(0);
});

it('removes the output listener on successful delivery too', async () => {
  const { settings } = options(request);
  expect(await runMockHook(settings)).toBe(0);
  expect(settings.output.listenerCount('error')).toBe(0);
});

it('distinguishes input transport failure from invalid JSON', async () => {
  const { settings, output, diagnostics } = options(request);
  const input = new Readable({
    read() {
      this.destroy(new Error('input transport'));
    },
  });
  expect(await runMockHook({ ...settings, input })).toBe(5);
  expect(JSON.parse(output.text())).toEqual({ outcome: 'transport-error', permitted: false });
  expect(diagnostics.text()).toBe('[arch mock hook] transport-error\n');
});

it('keeps a denial distinct from infrastructure errors', async () => {
  const { settings, output, diagnostics } = options(
    request,
    new Map([
      [
        'deny',
        () => ({
          id: 'deny',
          register: () => undefined,
          registerPolicy(api) {
            api.on('agent.beforeSpawn', () => ({ action: 'deny', reason: 'approval' }));
          },
        }),
      ],
    ]),
  );
  expect(await runMockHook(settings)).toBe(1);
  expect(JSON.parse(output.text())).toMatchObject({
    outcome: 'deny',
    permitted: false,
    denials: [{ middlewareId: 'deny', reason: 'approval' }],
  });
  expect(diagnostics.text()).toBe('[arch mock hook] deny\n');
});

it.each(['missing', 'no-handler', 'invalid-timeout'] as const)(
  'refuses trusted configuration failure %s',
  async (scenario) => {
    const modules: Registry = new Map([
      [
        'required',
        () => ({ id: 'required', register: () => undefined, registerPolicy: () => undefined }),
      ],
    ]);
    const { settings, output, diagnostics } = options(
      request,
      'missing' === scenario ? new Map() : modules,
    );
    expect(
      await runMockHook({
        ...settings,
        policyOptions: {
          requiredPolicies: ['required'],
          timeoutMs: 'invalid-timeout' === scenario ? 0 : 20,
        },
      }),
    ).toBe(7);
    expect(JSON.parse(output.text())).toMatchObject({
      outcome: 'policy-error',
      permitted: false,
      failures: [{ code: 'configuration-error' }],
    });
    expect(diagnostics.text()).toBe('[arch mock hook] policy-error\n');
  },
);

it('refuses invalid async registration even when it registered an allow handler first', async () => {
  const modules: Registry = new Map([
    [
      'required',
      () => ({
        id: 'required',
        register: () => undefined,
        registerPolicy(api) {
          api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
          return Promise.reject(new Error('private detail'));
        },
      }),
    ],
  ]);
  const { settings, output } = options(request, modules);
  expect(
    await runMockHook({ ...settings, policyOptions: { requiredPolicies: ['required'] } }),
  ).toBe(3);
  expect(JSON.parse(output.text())).toMatchObject({
    outcome: 'policy-error',
    permitted: false,
    failures: [{ code: 'registration-contract', middlewareId: 'required' }],
  });
  expect(output.text()).not.toContain('private detail');
});

it('refuses a timed-out mandatory handler and preserves the distinct timeout exit status', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  try {
    const modules: Registry = new Map([
      [
        'required',
        () => ({
          id: 'required',
          register: () => undefined,
          registerPolicy(api) {
            api.on('agent.beforeSpawn', () => new Promise(() => undefined));
            api.cleanup(() => {
              expect(api.signal?.aborted).toBe(true);
            });
          },
        }),
      ],
    ]);
    const { settings, output, diagnostics } = options(request, modules);
    const pending = runMockHook({
      ...settings,
      policyOptions: { requiredPolicies: ['required'], timeoutMs: 20, cleanupGraceMs: 10 },
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toBe(6);
    expect(JSON.parse(output.text())).toMatchObject({
      outcome: 'policy-error',
      permitted: false,
      failures: [{ code: 'timeout', stage: 'handler', middlewareId: 'required' }],
    });
    expect(diagnostics.text()).toBe('[arch mock hook] policy-error\n');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
