import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { events, records } from '../support.js';

const directories: string[] = [];
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
