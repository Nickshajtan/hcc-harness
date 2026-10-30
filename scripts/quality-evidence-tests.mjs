import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
