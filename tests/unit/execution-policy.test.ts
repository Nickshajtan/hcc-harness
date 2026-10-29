import { expect, it } from 'vitest';
import { ExecutionFailures } from '../../src/core/execution-failures.js';
import { composeLaunchEnvironment } from '../../src/core/execution-environment.js';

it('keeps failures absent until recorded and preserves primary identity, stage and secondary order', () => {
  const failures = new ExecutionFailures();
  expect(failures.hasFailures).toBe(false);
  expect(() => {
    failures.throwIfAny();
  }).not.toThrow();
  const primary = new Error('primary');
  const cleanup = new Error('cleanup');
  failures.record(primary, 'launch');
  failures.record(cleanup, 'finalize');
  expect(failures.hasFailures).toBe(true);
  expect(failures.stage).toBe('launch');
  try {
    failures.throwIfAny();
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) {
      throw error;
    }
    expect(error.message).toBe('Arch execution failed during launch');
    expect(error.errors).toEqual([primary, cleanup]);
    expect(error.cause).toBe(primary);
    return;
  }
  throw new Error('Expected ordered failure');
});

it.each([undefined, null, 'denied'])('retains thrown values including %s', (primary) => {
  const failures = new ExecutionFailures();
  failures.record(primary, 'finalize');
  expect(failures.stage).toBe('finalize');
  expect(() => {
    failures.throwIfAny();
  }).toThrow(AggregateError);
  try {
    failures.throwIfAny();
  } catch (error) {
    if (!(error instanceof AggregateError)) {
      throw error;
    }
    expect(error.errors).toEqual([primary]);
    expect(error.cause).toBe(primary);
  }
});

it.each(['win32', 'linux'] as const)(
  'composes %s environment replacement without touching native input',
  (platform) => {
    const original = { Mixed: 'old', MIXED: 'other', KEPT: '', ARCH_ACTIVE: 'old-id' };
    const changes = Object.freeze({ mixed: '', ADDED: 'value' });
    const result = composeLaunchEnvironment(original, changes, 'new-id', platform);
    expect(result).toEqual(
      'win32' === platform
        ? { KEPT: '', mixed: '', ADDED: 'value', ARCH_ACTIVE: 'new-id' }
        : {
            Mixed: 'old',
            MIXED: 'other',
            KEPT: '',
            mixed: '',
            ADDED: 'value',
            ARCH_ACTIVE: 'new-id',
          },
    );
    expect(original).toEqual({ Mixed: 'old', MIXED: 'other', KEPT: '', ARCH_ACTIVE: 'old-id' });
    expect(changes).toEqual({ mixed: '', ADDED: 'value' });
    expect(composeLaunchEnvironment({ KEPT: 'yes' }, {}, 'id', platform)).toEqual({
      KEPT: 'yes',
      ARCH_ACTIVE: 'id',
    });
  },
);
