import { expect, it } from 'vitest';
import { cancellationSignal } from '../../src/process/child-lifecycle.js';
import { executableExtensions } from '../../src/process/executable-resolver.js';

it.each(['win32', 'linux', 'darwin'] as const)(
  'preserves cancellation policy on %s',
  (platform) => {
    for (const reason of [
      'SIGINT',
      'SIGTERM',
      'SIGHUP',
      'SIGKILL',
      'unexpected',
      '',
      undefined,
      null,
      1,
      {},
    ]) {
      let expected = 'SIGTERM';
      if (
        'win32' !== platform &&
        'string' === typeof reason &&
        ['SIGINT', 'SIGTERM', 'SIGHUP'].includes(reason)
      ) {
        expected = reason;
      }
      expect(cancellationSignal(reason, platform)).toBe(expected);
    }
  },
);
it('does not coerce cancellation objects into supported signals', () => {
  const reason = { toString: () => 'SIGINT' };
  expect(cancellationSignal(reason, 'linux')).toBe('SIGTERM');
});
it('preserves Windows PATHEXT ordering, case, filtering and duplicates', () => {
  expect(executableExtensions('tool', {}, 'win32')).toEqual(['.com', '.exe', '.bat', '.cmd']);
  expect(
    executableExtensions(
      'tool',
      { OTHER: 'ignored', PathExt: '.CMD;.JS;.EXE;.COM;.BAT;.CMD;;' },
      'win32',
    ),
  ).toEqual(['.cmd', '.exe', '.com', '.bat', '.cmd']);
  expect(executableExtensions('tool', { PATHEXT: '' }, 'win32')).toEqual([]);
});
it.each(['linux', 'darwin', 'win32'] as const)(
  'leaves explicit executable extensions unchanged on %s',
  (platform) => {
    expect(executableExtensions('tool.cmd', { PATHEXT: '.EXE' }, platform)).toEqual(['']);
    if ('win32' !== platform) {
      expect(executableExtensions('tool', { PATHEXT: '.EXE' }, platform)).toEqual(['']);
    }
  },
);
