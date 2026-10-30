import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mutationEvidence, enforceMutation, pilots } from './check-mutation.mjs';

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
