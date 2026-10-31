import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { events, records, recordRemovalFailure } from '../support.js';

const directories: string[] = [];

it('persists nonzero removal status, streams and checkpoint presence before cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arch-removal-evidence-'));
  directories.push(root);
  await mkdir(join(root, '.arch'));
  await writeFile(join(root, '.arch/uninstall.json'), 'fixture checkpoint');
  const result = {
    code: 1,
    signal: null,
    stdout: '',
    stderr: 'EPERM: unable to unlink owned file',
  };
  const file = await recordRemovalFailure(root, result, { directory: join(root, 'evidence') });
  const evidence: unknown = JSON.parse(await readFile(file, 'utf8'));
  expect(evidence).toMatchObject({
    project: root,
    ...result,
    resources: ['uninstall.json'],
    stage: 'after child close, before fixture cleanup',
  });
});
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

it.each([null, [], {}, { id: 'id', payload: [] }])(
  'rejects malformed event output rather than trusting parsed JSON: %j',
  (value) => {
    expect(() =>
      events({
        code: 0,
        signal: null,
        stdout: '',
        stderr: `[arch:event] ${JSON.stringify(value)}`,
      }),
    ).toThrow('Malformed Arch event fixture output');
  },
);

it('keeps event envelope fields and payload while ignoring unrelated stderr', () => {
  const value = {
    id: 'id',
    type: 'execution.failed',
    executionId: 'run',
    timestamp: 'now',
    schemaVersion: 1,
    payload: { stage: 'resolution' },
  };
  expect(
    events({
      code: 1,
      signal: null,
      stdout: '',
      stderr: `native stderr\n[arch:event] ${JSON.stringify(value)}\n`,
    }),
  ).toEqual([value]);
});

it('validates every native record and preserves missing-file semantics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'arch-record-contract-'));
  directories.push(directory);
  const path = join(directory, 'records.jsonl');
  expect(await records(path)).toEqual([]);
  const valid = { args: ['a', ''], cwd: directory, demo: '', pid: 1 };
  await writeFile(path, JSON.stringify(valid) + '\n');
  expect(await records(path)).toEqual([valid]);
  const runtime = {
    args: [],
    cwd: directory,
    pid: 2,
    node: 'v22.12.0',
    exec: 'node',
    path: 'native',
  };
  await writeFile(path, JSON.stringify(runtime));
  expect(await records(path, 'runtime')).toEqual([runtime]);
  await expect(records(path)).rejects.toThrow('Malformed native fixture record');
  await writeFile(path, JSON.stringify({ pid: 3, node: 'v20.19.0' }));
  expect(await records(path, 'process')).toEqual([{ pid: 3, node: 'v20.19.0' }]);
  await writeFile(path, JSON.stringify({ pid: 3, node: false }));
  await expect(records(path, 'process')).rejects.toThrow('Malformed process fixture record');
  for (const value of [
    null,
    [],
    {},
    { ...valid, args: [1] },
    { ...valid, pid: 0 },
    { ...valid, cwd: null },
    { ...valid, demo: null },
    { ...runtime, path: null },
  ]) {
    await writeFile(path, JSON.stringify(value));
    await expect(records(path)).rejects.toThrow('Malformed native fixture record');
  }
  await writeFile(path, '{');
  await expect(records(path)).rejects.toBeInstanceOf(SyntaxError);
});
