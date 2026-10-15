import { expect, it } from 'vitest';
import { EventBus, event, type ArchEvent } from '../../src/events.js';

it('awaits delivery, handles sync/async subscriber failures, unsubscribes, and disposes', async () => {
  const errors: unknown[] = [], received: ArchEvent[] = [];
  const bus = new EventBus(error => { errors.push(error); });
  const off = bus.subscribe('execution.started', async value => { await Promise.resolve(); received.push(value); });
  bus.subscribe('execution.started', () => { throw new Error('sync'); });
  bus.subscribe('execution.started', async () => { await Promise.resolve(); throw new Error('async'); });
  const value = event('execution.started', 'id', { command: 'tool', projectRoot: '/p' });
  await bus.publish(value);
  expect(received).toEqual([value]);
  expect(errors).toHaveLength(2);
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.isFrozen(value.payload)).toBe(true);
  off();
  await bus.publish(event('execution.started', 'other', { command: 'tool', projectRoot: '/b' }));
  expect(received).toHaveLength(1);
  bus.dispose();
  expect(bus.listenerCount).toBe(0);
  await bus.publish(value);
  expect(errors).toHaveLength(4);
});

it('isolates buses and contains failures in diagnostic reporting', async () => {
  const a = new EventBus(() => { throw new Error('report failed'); }), b = new EventBus();
  const ids: string[] = [];
  a.subscribe('execution.failed', () => { throw new Error('observer cannot authorize'); });
  b.subscribe('execution.failed', value => { ids.push(value.executionId); });
  await Promise.all([a.publish(event('execution.failed', 'a', { stage: 'preflight' })), b.publish(event('execution.failed', 'b', { stage: 'preflight' }))]);
  expect(ids).toEqual(['b']);
  a.dispose(); b.dispose();
});
