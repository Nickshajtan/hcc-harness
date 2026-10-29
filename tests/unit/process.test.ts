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
