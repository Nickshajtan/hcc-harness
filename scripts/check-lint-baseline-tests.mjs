import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprints, compareWarnings } from './check-lint-baseline.mjs';

const finding = (source, line = 1, ruleId = 'legacy-rule') => [
  {
    filePath: '/repository/src/example.ts',
    source,
    messages: [{ severity: 1, ruleId, line, message: 'Unsafe boundary' }],
  },
];

test('line shifts and checkout roots do not introduce warnings', () => {
  const before = fingerprints(finding('const value = input!;'), '/repository');
  const after = fingerprints(finding('\n  const value = input!;', 2), '/repository');
  assert.deepEqual(compareWarnings(before, after), { added: [], removed: [] });
});

test('replacing one warning with another fails even when the count is unchanged', () => {
  const before = fingerprints(finding('const value = input!;'), '/repository');
  const after = fingerprints(finding('const other = external!;'), '/repository');
  assert.equal(compareWarnings(before, after).added.length, 1);
  assert.equal(compareWarnings(before, after).removed.length, 1);
});

test('duplicate findings are counted and removals are available for pruning', () => {
  assert.deepEqual(compareWarnings(['same'], ['same', 'same']), { added: ['same'], removed: [] });
  assert.deepEqual(compareWarnings(['old', 'same'], ['same']), { added: [], removed: ['old'] });
});

test('missing source context cannot produce a clean result', () => {
  assert.throws(() => fingerprints(finding('', 2), '/repository'), /Cannot fingerprint/);
});
