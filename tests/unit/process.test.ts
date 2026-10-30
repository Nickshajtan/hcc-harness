import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter, getEventListeners } from 'node:events';
import { launch } from '../../src/process.js';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

class Child extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn(() => true);
}
let child: Child;
let controller: AbortController;
beforeEach(() => {
  vi.useFakeTimers();
  child = new Child();
  controller = new AbortController();
  spawn.mockReset().mockImplementation(() => child);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const run = () =>
  launch(process.execPath, ['--version'], process.cwd(), process.env, controller.signal);
function disposed() {
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  expect(child.listenerCount('close')).toBe(0);
  expect(child.listenerCount('error')).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
}

it('does not spawn for an already-aborted signal', async () => {
  controller.abort(new Error('cancelled'));
  await expect(run()).rejects.toThrow('cancelled');
  expect(spawn).not.toHaveBeenCalled();
  disposed();
});

it('does not lose abort during child initialization', async () => {
  spawn.mockImplementation(() => {
    controller.abort('SIGTERM');
    return child;
  });
  const result = run();
  expect(child.kill).toHaveBeenCalledTimes(1);
  child.emit('close', null, 'SIGTERM');
  await expect(result).resolves.toEqual({ exitCode: 1, signal: 'SIGTERM' });
  disposed();
});

it('handles abort during listener installation exactly once with one escalation timer', async () => {
  const add = controller.signal.addEventListener.bind(controller.signal);
  vi.spyOn(controller.signal, 'addEventListener').mockImplementation((type, listener, options) => {
    add(type, listener, options);
    controller.abort('SIGTERM');
  });
  const result = run();
  expect(child.kill).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1);
  child.emit('close', null, 'SIGTERM');
  await result;
  disposed();
});

it('handles repeated cancellation attempts without duplicate side effects', async () => {
  const result = run();
  const handler = getEventListeners(controller.signal, 'abort')[0] as () => void;
  controller.abort('SIGTERM');
  handler();
  handler();
  expect(child.kill).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1);
  child.emit('close', null, 'SIGTERM');
  await result;
  disposed();
});

it('escalates once if graceful termination is ignored and disposes its timer', async () => {
  const result = run();
  controller.abort('SIGTERM');
  expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  await vi.advanceTimersByTimeAsync(3000);
  expect(child.kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']]);
  child.emit('close', null, 'SIGKILL');
  await expect(result).resolves.toEqual({ exitCode: 1, signal: 'SIGKILL' });
  disposed();
});

it('does not cancel normal completion or an abort arriving after close', async () => {
  const result = run();
  child.exitCode = 23;
  child.emit('close', 23, null);
  controller.abort();
  await expect(result).resolves.toEqual({ exitCode: 23, signal: null });
  expect(child.kill).not.toHaveBeenCalled();
  disposed();
});

it('does not kill a child whose exit is already visible before close', async () => {
  const result = run();
  child.exitCode = 0;
  controller.abort();
  expect(child.kill).not.toHaveBeenCalled();
  child.emit('close', 0, null);
  await result;
  disposed();
});

it('accounts for a child already exited during initialization', async () => {
  spawn.mockImplementation(() => {
    child.exitCode = 4;
    return child;
  });
  const result = run();
  await expect(result).resolves.toEqual({ exitCode: 4, signal: null });
  disposed();
});

it('disposes cancellation resources when child error wins the race', async () => {
  const error = new Error('spawn failed');
  const result = run();
  const rejected = expect(result).rejects.toBe(error);
  child.emit('error', error);
  controller.abort();
  await rejected;
  expect(child.kill).not.toHaveBeenCalled();
  disposed();
});

it('disposes resources when cancellation precedes child error', async () => {
  const error = new Error('child error');
  const result = run();
  const rejected = expect(result).rejects.toBe(error);
  controller.abort();
  child.emit('error', error);
  await rejected;
  disposed();
});

it('does not create a timer if termination synchronously completes or fails', async () => {
  child.kill.mockImplementation(() => {
    child.emit('close', 0, null);
    return true;
  });
  const result = run();
  controller.abort();
  await result;
  disposed();
});

it('contains synchronous termination errors and cleans all resources', async () => {
  const error = new Error('kill failed');
  child.kill.mockImplementation(() => {
    throw error;
  });
  const result = run();
  const rejected = expect(result).rejects.toBe(error);
  controller.abort();
  await rejected;
  disposed();
});

it('cleans up when graceful termination synchronously emits a child error', async () => {
  const error = new Error('kill emitted error');
  child.kill.mockImplementation(() => {
    child.emit('error', error);
    return false;
  });
  const result = run();
  const rejected = expect(result).rejects.toBe(error);
  controller.abort();
  await rejected;
  disposed();
});

it('rejects synchronous spawn failure without installing cancellation resources', async () => {
  spawn.mockImplementation(() => {
    throw new Error('spawn throws');
  });
  await expect(run()).rejects.toThrow('spawn throws');
  disposed();
});

it('still escalates when the graceful kill reports no delivered signal', async () => {
  child.kill.mockReturnValue(false);
  const result = run();
  controller.abort('SIGINT');
  expect(child.kill).toHaveBeenCalledWith('win32' === process.platform ? 'SIGTERM' : 'SIGINT');
  await vi.advanceTimersByTimeAsync(2999);
  expect(child.kill).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
  child.emit('close', null, 'SIGKILL');
  await expect(result).resolves.toEqual({ exitCode: 1, signal: 'SIGKILL' });
  disposed();
});

it('rejects an escalation error by identity and removes cancellation resources', async () => {
  const error = new Error('escalation failed');
  child.kill.mockImplementation((signal?: string) => {
    if ('SIGKILL' === signal) {
      throw error;
    }
    return true;
  });
  const result = run();
  const rejected = expect(result).rejects.toBe(error);
  controller.abort();
  await vi.advanceTimersByTimeAsync(3000);
  await rejected;
  disposed();
});

it('does not escalate a child whose signal termination becomes visible before close', async () => {
  const result = run();
  controller.abort();
  child.signalCode = 'SIGTERM';
  await vi.advanceTimersByTimeAsync(3000);
  expect(child.kill).toHaveBeenCalledTimes(1);
  child.emit('close', null, 'SIGTERM');
  await result;
  disposed();
});

it('passes immutable arguments and caller environment directly to shell-free inherited execution', async () => {
  const args = Object.freeze(['', 'space value', '%PATH% & |', 'tail\\']);
  const env = Object.freeze({ PATH: 'native-only', ARCH_NODE: 'not-a-native-fallback' });
  const result = launch('native', args, 'project', env, controller.signal);
  expect(spawn).toHaveBeenCalledExactlyOnceWith('native', [...args], {
    cwd: 'project',
    env,
    stdio: 'inherit',
    shell: false,
  });
  expect(spawn.mock.calls[0]?.[1]).not.toBe(args);
  child.emit('close', 23, null);
  const completed = await result;
  expect(completed).toEqual({ exitCode: 23, signal: null });
  expect(Object.isFrozen(completed)).toBe(true);
  disposed();
});

it.each(['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGKILL', 'unexpected', undefined])(
  'preserves the supported cancellation signal policy for %s',
  async (reason) => {
    const result = run();
    controller.abort(reason);
    const forwarded = ['SIGINT', 'SIGTERM', 'SIGHUP'].includes(reason ?? '') ? reason : 'SIGTERM';
    expect(child.kill).toHaveBeenCalledWith('win32' === process.platform ? 'SIGTERM' : forwarded);
    child.emit('close', null, 'SIGTERM');
    await result;
    disposed();
  },
);

it('keeps simultaneous children and cancellation resources independent', async () => {
  const first = child;
  const firstResult = run();
  const second = new Child();
  const secondController = new AbortController();
  spawn.mockReturnValueOnce(second);
  const secondResult = launch('native', [], 'other', {}, secondController.signal);
  controller.abort();
  expect(first.kill).toHaveBeenCalledTimes(1);
  expect(second.kill).not.toHaveBeenCalled();
  second.emit('close', 7, null);
  expect(await secondResult).toEqual({ exitCode: 7, signal: null });
  expect(vi.getTimerCount()).toBe(1);
  first.emit('close', null, 'SIGTERM');
  await firstResult;
  expect(getEventListeners(secondController.signal, 'abort')).toHaveLength(0);
  expect(second.eventNames()).toEqual([]);
  disposed();
});

it('ignores a captured close callback after an error has already settled execution', async () => {
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const result = run();
  const rejected = expect(result).rejects.toThrow('first failure');
  const close = child.listeners('close')[0];
  child.emit('error', new Error('first failure'));
  close?.(0, null);
  await rejected;
  expect(remove).toHaveBeenCalledTimes(1);
  disposed();
});

it('ignores a captured error callback after native completion has already settled execution', async () => {
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const result = run();
  const failed = child.listeners('error')[0];
  child.emit('close', 8, null);
  failed?.(new Error('late failure'));
  expect(await result).toEqual({ exitCode: 8, signal: null });
  expect(remove).toHaveBeenCalledTimes(1);
  disposed();
});

it('observes signal-only termination during initialization without cancelling it', async () => {
  const add = vi.spyOn(controller.signal, 'addEventListener');
  spawn.mockImplementation(() => {
    child.signalCode = 'SIGINT';
    return child;
  });
  expect(await run()).toEqual({ exitCode: 1, signal: 'SIGINT' });
  expect(add).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
  expect(child.kill).not.toHaveBeenCalled();
  disposed();
});

it('does not cancel when signal termination becomes visible before abort', async () => {
  const result = run();
  child.signalCode = 'SIGINT';
  controller.abort();
  expect(child.kill).not.toHaveBeenCalled();
  child.emit('close', null, 'SIGINT');
  await result;
  disposed();
});

it('unrefs escalation and refuses an already-queued timer callback after settlement', async () => {
  const scheduled = vi.spyOn(globalThis, 'setTimeout');
  const result = run();
  controller.abort();
  const timer = scheduled.mock.results[0];
  expect(timer?.type).toBe('return');
  if ('return' !== timer?.type) {
    throw new Error('Expected an escalation timer');
  }
  expect(timer.value.hasRef()).toBe(false);
  const callback = scheduled.mock.calls[0]?.[0];
  child.emit('close', 0, null);
  await result;
  if ('function' !== typeof callback) {
    throw new Error('Expected an escalation callback');
  }
  callback();
  expect(child.kill).toHaveBeenCalledTimes(1);
  disposed();
});

it('does not escalate when a normal exit becomes visible before close', async () => {
  const result = run();
  controller.abort();
  child.exitCode = 7;
  await vi.advanceTimersByTimeAsync(3000);
  expect(child.kill).toHaveBeenCalledTimes(1);
  child.emit('close', 7, null);
  await result;
  disposed();
});
