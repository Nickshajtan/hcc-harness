import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprints, compareWarnings } from './check-lint-baseline.mjs';
import { ESLint } from 'eslint';

test('ordinary test exceptions do not relax production or evidence infrastructure', async () => {
  const eslint = new ESLint();
  const severity = async (file, rule) => (await eslint.calculateConfigForFile(file)).rules[rule][0];
  for (const file of [
    'tests/unit/core.test.ts',
    'tests/integration/process.test.ts',
    'tests/acceptance/routing.test.ts',
    'tests/feasibility/runtime-contract.test.ts',
  ]) {
    assert.equal(await severity(file, '@typescript-eslint/no-unnecessary-condition'), 0);
    assert.equal(await severity(file, '@typescript-eslint/no-non-null-assertion'), 0);
    for (const rule of [
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/no-misused-promises',
      '@typescript-eslint/no-unused-vars',
      '@typescript-eslint/no-unsafe-assignment',
      'no-unreachable',
    ]) {
      assert.equal(await severity(file, rule), 2, `${file}: ${rule}`);
    }
  }
  for (const file of ['src/core/index.ts', 'tests/support.ts', 'tests/recovery-evidence.ts']) {
    assert.equal(await severity(file, '@typescript-eslint/no-non-null-assertion'), 2);
    assert.notEqual(await severity(file, '@typescript-eslint/no-unnecessary-condition'), 0);
    assert.equal(await severity(file, '@typescript-eslint/no-floating-promises'), 2);
  }
  assert.equal(
    await severity('tests/support.ts', '@typescript-eslint/prefer-nullish-coalescing'),
    0,
  );
  assert.equal(
    await severity('src/core/index.ts', '@typescript-eslint/prefer-nullish-coalescing'),
    1,
  );
  for (const file of [
    'scripts/check-reliability.mjs',
    'scripts/check-mutation.mjs',
    'scripts/quality-evidence.mjs',
  ]) {
    assert.equal(await severity(file, '@typescript-eslint/no-unused-vars'), 2);
    assert.equal(await severity(file, 'no-unreachable'), 2);
  }
});

test('real lint rejects production violations while only ordinary tests allow fixture assertions', async () => {
  const eslint = new ESLint();
  const source = 'export function fixture(value?: string) { return value!; }\n';
  const [production] = await eslint.lintText(source, { filePath: 'src/config.ts' });
  assert.ok(0 < production.errorCount);
  assert.ok(
    production.messages.some(
      (message) =>
        '@typescript-eslint/no-non-null-assertion' === message.ruleId && 2 === message.severity,
    ),
  );
  const [ordinary] = await eslint.lintText(source, { filePath: 'tests/unit/core.test.ts' });
  assert.equal(ordinary.errorCount, 0);
  const [infrastructure] = await eslint.lintText(source, { filePath: 'tests/support.ts' });
  assert.ok(
    infrastructure.messages.some(
      (message) =>
        '@typescript-eslint/no-non-null-assertion' === message.ruleId && 2 === message.severity,
    ),
  );
});

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
