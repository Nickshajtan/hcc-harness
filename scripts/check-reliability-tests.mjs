import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateReliability } from './check-reliability.mjs';

function complete() {
  return [false, true].flatMap((interrupted) =>
    [1, 3].map((lanes) => ({
      interrupted,
      lanes,
      iterations: 4,
      failed: false,
      cleanup: 'completed',
      evidence: Array.from({ length: lanes }, (_, lane) =>
        Array.from({ length: 4 }, (_, iteration) =>
          ['initialize', 'native', 'uninstall'].map((stage) => ({
            lane,
            iteration,
            stage,
            interrupted,
            code: 0,
            signal: null,
          })),
        ),
      ).flat(2),
    })),
  );
}

test('counts every first attempt and requires completed teardown', () => {
  assert.deepEqual(validateReliability(complete()), {
    status: 'PASS',
    profiles: 4,
    sequences: 32,
    attempts: 96,
  });
  for (const corrupt of [
    (reports) => reports.pop(),
    (reports) => {
      reports[0].evidence.pop();
    },
    (reports) => {
      reports[0].evidence[0].code = 1;
    },
    (reports) => {
      reports[0].evidence[0].signal = 'SIGTERM';
    },
    (reports) => {
      reports[0].evidence = [];
    },
    (reports) => {
      reports[0].cleanup = 'pending';
    },
    (reports) => {
      reports[0].cleanup = 'failed: EBUSY';
    },
    (reports) => {
      reports[0].failed = true;
    },
    (reports) => {
      reports[0].evidence[0].stage = 'unexpected';
    },
    (reports) => {
      reports[0].evidence[0] = reports[0].evidence[1];
    },
  ]) {
    const reports = complete();
    corrupt(reports);
    assert.throws(() => validateReliability(reports));
  }
});

test('reporting fails on missing, malformed, truncated evidence and report-write errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arch-reliability-report-'));
  const script = fileURLToPath(new URL('./check-reliability.mjs', import.meta.url));
  const invoke = () =>
    spawnSync(process.execPath, [script, join(root, 'input')], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
    });
  try {
    assert.notEqual(invoke().status, 0);
    await mkdir(join(root, 'input'));
    for (const text of ['{', 'null', '{}']) {
      await writeFile(join(root, 'input/0.json'), text);
      assert.notEqual(invoke().status, 0);
    }
    for (const [index, report] of complete().entries()) {
      await writeFile(join(root, `input/${index}.json`), JSON.stringify(report));
    }
    // A file blocks creation of the output directory: writing evidence is required.
    await rm(join(root, 'reports'), { recursive: true, force: true });
    await writeFile(join(root, 'reports'), 'not a directory');
    assert.notEqual(invoke().status, 0);
    await assert.rejects(readFile(join(root, 'reports/reliability-results.json')));
    await rm(join(root, 'reports'));
    const child = invoke();
    assert.equal(child.status, 0, child.stderr);
    assert.equal(
      JSON.parse(await readFile(join(root, 'reports/reliability-results.json'))).status,
      'PASS',
    );
    await writeFile(join(root, 'input/0.json'), '{');
    assert.notEqual(invoke().status, 0);
    assert.equal(
      JSON.parse(await readFile(join(root, 'reports/reliability-results.json'))).status,
      'FAIL',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
