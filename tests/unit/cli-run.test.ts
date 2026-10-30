import assert from 'node:assert/strict';
import { constants } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runCommand } from '../../src/cli/native-run.js';
import { execute } from '../../src/core.js';
import { EventBus, event } from '../../src/events.js';

vi.mock('../../src/core.js', () => ({ execute: vi.fn() }));
const platform = Object.getOwnPropertyDescriptor(process, 'platform');
const originalExitCode = process.exitCode;
const listeners = new Map<string, (...args: unknown[]) => void>();
const removed = vi.fn<typeof process.off>();
const killed = vi.fn<typeof process.kill>();
const addProcessListener = process.on.bind(process);
const removeProcessListener = process.off.bind(process);
beforeEach(() => {
  vi.resetAllMocks();
  listeners.clear();
  vi.spyOn(process, 'on').mockImplementation((name, listener) => {
    if ('string' === typeof name && ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].includes(name)) {
      listeners.set(name, listener);
    }
    return addProcessListener(name, listener);
  });
  removed.mockImplementation(removeProcessListener);
  killed.mockReturnValue(true);
  vi.spyOn(process, 'off').mockImplementation(removed);
  vi.spyOn(process, 'kill').mockImplementation(killed);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubEnv('ARCH_TRACE', '');
  process.exitCode = undefined;
});
afterEach(() => {
  // Also release subscriptions if a mutant omitted the production finally.
  for (const [name, listener] of listeners) {
    removeProcessListener(name, listener);
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (platform) {
    Object.defineProperty(process, 'platform', platform);
  }
  process.exitCode = originalExitCode;
});
function cancel(signal: NodeJS.Signals) {
  const handler = listeners.get(signal);
  assert(handler);
  handler();
}
function expectDisposed() {
  for (const [name, listener] of listeners) {
    expect(removed).toHaveBeenCalledWith(name, listener);
  }
  expect(removed).toHaveBeenCalledTimes(listeners.size);
}

it('preserves command, arguments, cwd, native status and scoped signal subscriptions', async () => {
  vi.mocked(execute).mockResolvedValue({ exitCode: 29, signal: null });
  const args = Object.freeze(['', 'space value', '--flag']);
  await runCommand('tool', args);
  expect(execute).toHaveBeenCalledTimes(1);
  const options = vi.mocked(execute).mock.calls[0]?.[0];
  assert(options);
  expect(options.command).toBe('tool');
  expect(options.args).toBe(args);
  expect(options.cwd).toBe(process.cwd());
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(typeof options.observe).toBe('function');
  expect([...listeners.keys()]).toEqual([
    'SIGINT',
    'SIGTERM',
    'SIGHUP',
    ...('win32' === process.platform ? ['SIGBREAK'] : []),
  ]);
  expect(process.exitCode).toBe(29);
  expect(killed).not.toHaveBeenCalled();
  expectDisposed();
});
it('propagates an uncancelled error by identity and always removes subscriptions', async () => {
  const error = new Error('launch failed');
  vi.mocked(execute).mockRejectedValue(error);
  await expect(runCommand('tool', [])).rejects.toBe(error);
  expect(process.exitCode).toBeUndefined();
  expectDisposed();
});
it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)(
  'preserves cancellation %s over a native result or failure',
  async (signal) => {
    for (const failure of [false, true]) {
      vi.mocked(execute).mockImplementation((options) => {
        cancel(signal);
        expect(options.signal?.reason).toBe(signal);
        return failure
          ? Promise.reject(new Error('cancelled'))
          : Promise.resolve({ exitCode: 7, signal: null });
      });
      await runCommand('tool', []);
      expect(process.exitCode).toBe(128 + constants.signals[signal]);
      expect(killed).not.toHaveBeenCalled();
    }
    expect(removed).toHaveBeenCalledTimes(2 * listeners.size);
  },
);
it.each(['linux', 'darwin', 'win32'] as const)(
  'maps native termination on %s after disposing subscriptions',
  async (host) => {
    Object.defineProperty(process, 'platform', { value: host });
    vi.mocked(execute).mockResolvedValue({ exitCode: 1, signal: 'SIGTERM' });
    killed.mockImplementation(() => {
      expectDisposed();
      return true;
    });
    await runCommand('tool', []);
    expectDisposed();
    if ('win32' === host) {
      expect(process.exitCode).toBe(128 + constants.signals.SIGTERM);
      expect(killed).not.toHaveBeenCalled();
    } else {
      expect(killed).toHaveBeenCalledExactlyOnceWith(process.pid, 'SIGTERM');
      expect(process.exitCode).toBeUndefined();
    }
  },
);
it.each(['', '0', '1'])(
  'enables only explicit tracing (%j), with the established event set',
  async (trace) => {
    vi.stubEnv('ARCH_TRACE', trace);
    const bus = new EventBus();
    vi.mocked(execute).mockImplementation(async (options) => {
      await options.observe?.(bus);
      await bus.publish(event('execution.started', 'id', { command: 'tool', projectRoot: '/p' }));
      await bus.publish(
        event('middleware.completed', 'id', { middlewareId: 'demo', phase: 'preflight' }),
      );
      await bus.publish(event('execution.completed', 'id', { exitCode: 0, signal: null }));
      await bus.publish(event('execution.failed', 'id', { stage: 'launch' }));
      return { exitCode: 0, signal: null };
    });
    try {
      await runCommand('tool', []);
      expect(console.error).toHaveBeenCalledTimes('1' === trace ? 4 : 0);
      if ('1' === trace) {
        for (const call of vi.mocked(console.error).mock.calls) {
          expect(call[0]).toBe('[arch:event]');
          expect(typeof call[1]).toBe('string');
        }
      }
      expectDisposed();
    } finally {
      bus.dispose();
    }
  },
);
