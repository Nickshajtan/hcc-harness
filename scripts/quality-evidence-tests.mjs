import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('effect pilot reporting rejects missing evidence instead of creating a PASS', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arch-effect-evidence-'));
  try {
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./report-effects-mutation.mjs', import.meta.url))],
      { cwd: root, encoding: 'utf8' },
    );
    assert.notEqual(child.status, 0);
    await assert.rejects(readFile(join(root, 'reports/effects-mutation-results.json')), {
      code: 'ENOENT',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a successful step with missing artifacts is FAIL, never PASS', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arch-quality-evidence-'));
  try {
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./summarize-quality.mjs', import.meta.url))],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: '',
          LINT_OUTCOME: 'success',
          DEPENDENCY_OUTCOME: 'success',
          COVERAGE_OUTCOME: 'success',
          MUTATION_OUTCOME: 'success',
        },
      },
    );
    assert.equal(child.status, 1, child.stderr);
    const report = JSON.parse(await readFile(join(root, 'reports/quality-results.json'), 'utf8'));
    assert.deepEqual(report.results, {
      lint: 'FAIL',
      dependencies: 'FAIL',
      coverage: 'FAIL',
      mutation: 'FAIL',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('coverage totals cannot conceal a missing maintained production file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arch-coverage-completeness-'));
  try {
    await mkdir(join(root, 'src'));
    await mkdir(join(root, 'coverage'));
    await writeFile(join(root, 'src/critical.ts'), 'export const critical = true;\n');
    await writeFile(
      join(root, 'coverage/tests.json'),
      JSON.stringify({
        success: true,
        numFailedTests: 0,
        numPassedTests: 1,
        numTotalTests: 1,
        testResults: [{ assertionResults: [{ status: 'passed' }] }],
      }),
    );
    await writeFile(
      join(root, 'coverage/coverage-summary.json'),
      JSON.stringify({
        total: { lines: { total: 1, pct: 100 }, branches: { pct: 100 } },
      }),
    );
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./summarize-quality.mjs', import.meta.url))],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: '',
          LINT_OUTCOME: 'skipped',
          DEPENDENCY_OUTCOME: 'skipped',
          COVERAGE_OUTCOME: 'success',
          MUTATION_OUTCOME: 'skipped',
        },
      },
    );
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /Coverage evidence omits maintained production source/);
    const report = JSON.parse(await readFile(join(root, 'reports/quality-results.json'), 'utf8'));
    assert.equal(report.results.coverage, 'FAIL');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the actual wizard summary fails closed for missing or failing measurement files', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/wizard.yml', import.meta.url),
    'utf8',
  );
  const source = /node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/.exec(workflow)?.[1];
  assert.ok(source, 'Wizard summary source must remain discoverable by this contract test');
  const root = await mkdtemp(join(tmpdir(), 'arch-wizard-evidence-'));
  try {
    const directory = join(root, '.test-state/wizard');
    await mkdir(directory, { recursive: true });
    for (const [unit, terminal, expected] of [
      [undefined, undefined, 1],
      [{ success: true, numPassedTests: 1, numFailedTests: 0 }, undefined, 1],
      [{ success: true, numPassedTests: 1, numFailedTests: 0 }, { result: 'PASS', checks: [] }, 1],
      [
        { success: false, numPassedTests: 1, numFailedTests: 1 },
        { result: 'PASS', checks: [{ name: 'scenario', result: 'PASS' }] },
        1,
      ],
      [
        { success: true, numPassedTests: 1, numFailedTests: 0 },
        { result: 'PASS', checks: [{ name: 'scenario', result: 'PASS' }] },
        0,
      ],
    ]) {
      if (unit) {
        await writeFile(join(directory, 'unit.json'), JSON.stringify(unit));
      }
      if (terminal) {
        await writeFile(join(directory, 'results.json'), JSON.stringify(terminal));
      }
      const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: join(root, 'summary.md') },
      });
      assert.equal(child.status, expected, child.stderr);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('regression summaries reject missing, malformed and incomplete suite reports', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const source = /node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/.exec(workflow)?.[1];
  assert.ok(source, 'Regression evidence summary must remain discoverable');
  const root = await mkdtemp(join(tmpdir(), 'arch-regression-evidence-'));
  const invoke = () =>
    spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
    });
  const valid = {
    success: true,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTotalTests: 1,
    testResults: [{ assertionResults: [{ status: 'passed' }] }],
  };
  try {
    assert.equal(invoke().status, 1);
    await mkdir(join(root, '.test-state'));
    for (const suite of ['unit', 'integration', 'acceptance']) {
      await writeFile(join(root, `.test-state/m2-${suite}.json`), JSON.stringify(valid));
    }
    assert.equal(invoke().status, 0);
    for (const value of [
      '{',
      '{}',
      JSON.stringify({ ...valid, numTotalTests: 2 }),
      JSON.stringify({ ...valid, success: false }),
    ]) {
      await writeFile(join(root, '.test-state/m2-unit.json'), value);
      assert.equal(invoke().status, 1);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dependency modules without a verified summary cannot produce PASS', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arch-dependency-evidence-'));
  try {
    await mkdir(join(root, 'reports'));
    await writeFile(join(root, 'reports/dependencies.json'), JSON.stringify({ modules: [{}] }));
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./summarize-quality.mjs', import.meta.url))],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: '',
          LINT_OUTCOME: 'skipped',
          COVERAGE_OUTCOME: 'skipped',
          DEPENDENCY_OUTCOME: 'success',
          MUTATION_OUTCOME: 'skipped',
        },
      },
    );
    assert.equal(child.status, 1, child.stderr);
    const report = JSON.parse(await readFile(join(root, 'reports/quality-results.json'), 'utf8'));
    assert.equal(report.results.dependencies, 'FAIL');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
