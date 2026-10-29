import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
