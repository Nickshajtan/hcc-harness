import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mutationEvidence,
  enforceMutation,
  verifyMutationSources,
  pilots,
} from './check-mutation.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('mutation source evidence rejects stale or missing code while accepting checkout line endings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arch-mutation-source-'));
  try {
    await writeFile(join(root, 'decision.ts'), 'export const enabled = true;\n');
    const measured = { files: { 'decision.ts': { source: 'export const enabled = true;\r\n' } } };
    await verifyMutationSources(measured, ['decision.ts'], root);
    await assert.rejects(
      verifyMutationSources({ files: {} }, ['decision.ts'], root),
      /Missing mutation source/,
    );
    await writeFile(join(root, 'decision.ts'), 'export const enabled = false;\n');
    await assert.rejects(
      verifyMutationSources(measured, ['decision.ts'], root),
      /Stale mutation source/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const report = (statuses) => ({
  files: { 'src/config.ts': { mutants: statuses.map((status) => ({ status })) } },
});
test('timeouts are visible and cannot substitute for assertion kills at the gate', () => {
  const scopes = mutationEvidence(report(['Killed', 'Timeout']));
  assert.equal(scopes[0].score, 100);
  assert.equal(scopes[0].assertionScore, 50);
  assert.throws(() => enforceMutation(scopes), /below 90%/);
});
test('missing, empty and infrastructure error reports fail closed', () => {
  for (const value of [
    {},
    { files: {} },
    report([]),
    report(['RuntimeError']),
    report(['CompileError']),
    report(['Ignored']),
    report(['Unexpected']),
  ]) {
    assert.throws(() => mutationEvidence(value));
  }
});
test('a measured passing scope passes and a survivor reduces its score', () => {
  const scopes = mutationEvidence(report(['Killed']));
  assert.doesNotThrow(() => enforceMutation(scopes));
  assert.equal(mutationEvidence(report(['Survived']))[0].assertionScore, 0);
  assert.throws(() => enforceMutation(scopes, ['src/events.ts']), /Missing mutation scope/);
});

test('Core and every extracted execution scope reject surviving-only reports', () => {
  for (const file of [
    'src/core/index.ts',
    'src/core/execution-session.ts',
    'src/core/execution-failures.ts',
    'src/core/execution-environment.ts',
  ]) {
    const scopes = mutationEvidence({ files: { [file]: { mutants: [{ status: 'Survived' }] } } });
    assert.throws(() => enforceMutation(scopes), /below 85%/);
  }
});

test('lifecycle decision gates reject survivors and timeout-only reports', () => {
  for (const file of [
    'src/lifecycle/manifest.ts',
    'src/lifecycle/ownership.ts',
    'src/lifecycle/routing-journal.ts',
    'src/lifecycle/recovery-validation.ts',
  ]) {
    for (const status of ['Survived', 'Timeout']) {
      const scopes = mutationEvidence({ files: { [file]: { mutants: [{ status }] } } });
      assert.throws(() => enforceMutation(scopes), /below (85|90)%/);
    }
  }
});

test('every measured process scope rejects survivors and timeout-only evidence', () => {
  for (const file of [
    'src/process/native-environment.ts',
    'src/process/executable-resolver.ts',
    'src/process/windows-npm-shim.ts',
    'src/process/launch.ts',
    'src/process/child-lifecycle.ts',
  ]) {
    for (const status of ['Survived', 'Timeout']) {
      const scopes = mutationEvidence({ files: { [file]: { mutants: [{ status }] } } });
      assert.throws(() => enforceMutation(scopes), /below (85|90)%/);
    }
  }
});

test('each CLI and Wizard gate rejects survivors and timeout-only evidence', () => {
  for (const file of pilots.cli.files) {
    for (const status of ['Survived', 'Timeout']) {
      const scopes = mutationEvidence({ files: { [file]: { mutants: [{ status }] } } });
      assert.throws(() => enforceMutation(scopes), /below (85|90)%/);
    }
  }
});
