import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PolicyDeadline } from '../../src/policy-deadline.js';

it.each(['handler', 'cleanup'] as const)(
  'refuses %s admission at its exact end without waiting for timer delivery',
  async (phase) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const deadline = new PolicyDeadline(20, 10);
    const operation = vi.fn();
    const clock = vi.spyOn(performance, 'now').mockReturnValue('cleanup' === phase ? 30 : 20);
    try {
      expect(await deadline.wait(operation, phase)).toEqual({
        status: 'cleanup' === phase ? 'skipped-deadline' : 'timeout',
      });
      expect(operation).not.toHaveBeenCalled();
      expect(deadline.signal.aborted).toBe(true);
    } finally {
      clock.mockRestore();
      deadline.dispose();
    }
  },
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
});

it('signals the deadline during ongoing cleanup without requiring a poll', async () => {
  const deadline = new PolicyDeadline(20, 10);
  const done = vi.fn();
  try {
    const pending = deadline.wait(
      () =>
        new Promise<string>((resolve) => {
          deadline.signal.addEventListener(
            'abort',
            () => {
              resolve('released');
            },
            { once: true },
          );
        }),
      'cleanup',
    );
    void pending.then(done);
    await vi.advanceTimersByTimeAsync(20);
    expect(deadline.signal.aborted).toBe(true);
    expect(done).toHaveBeenCalledWith({ status: 'fulfilled', value: 'released' });
    await pending;
  } finally {
    deadline.dispose();
  }
  expect(vi.getTimerCount()).toBe(0);
});

it('detects the exact elapsed deadline even if the timer has not been delivered', () => {
  const deadline = new PolicyDeadline(20, 10);
  const clock = vi.spyOn(performance, 'now');
  try {
    clock.mockReturnValue(19.9);
    expect(deadline.hasExpired()).toBe(false);
    expect(deadline.signal.aborted).toBe(false);
    clock.mockReturnValue(20);
    expect(deadline.hasExpired()).toBe(true);
    expect(deadline.signal.aborted).toBe(true);
  } finally {
    clock.mockRestore();
    deadline.dispose();
  }
});

it('settles a fast value immediately instead of waiting for the timer', async () => {
  const deadline = new PolicyDeadline(20, 10);
  const done = vi.fn();
  try {
    const pending = deadline.wait(() => 'allowed', 'handler');
    void pending.then(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalledWith({ status: 'fulfilled', value: 'allowed' });
    await pending;
    expect(deadline.signal.aborted).toBe(false);
  } finally {
    deadline.dispose();
  }
  expect(vi.getTimerCount()).toBe(0);
});

it('settles a hanging waiter at its deadline, independently of the signal', async () => {
  const deadline = new PolicyDeadline(20, 10);
  const done = vi.fn();
  try {
    const pending = deadline.wait(() => new Promise<string>(() => undefined), 'handler');
    void pending.then(done);
    await vi.advanceTimersByTimeAsync(20);
    expect(done).toHaveBeenCalledWith({ status: 'timeout' });
    await pending;
    expect(deadline.signal.aborted).toBe(true);
  } finally {
    deadline.dispose();
  }
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects a late synchronous value using monotonic time before timer delivery', async () => {
  const deadline = new PolicyDeadline(20, 10);
  const clock = vi.spyOn(performance, 'now');
  try {
    expect(
      await deadline.wait(() => {
        clock.mockReturnValue(25);
        return 'too late';
      }, 'handler'),
    ).toEqual({ status: 'timeout' });
    expect(deadline.signal.aborted).toBe(true);
  } finally {
    clock.mockRestore();
    deadline.dispose();
  }
  expect(vi.getTimerCount()).toBe(0);
});
