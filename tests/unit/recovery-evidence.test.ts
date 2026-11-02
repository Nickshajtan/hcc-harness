import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { recoveryEvidence } from '../recovery-evidence.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'arch-recovery-evidence-'));
  roots.push(root);
  await mkdir(join(root, '.arch'));
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    expect(dirname(root)).toBe(resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});

it('preserves exact checkpoint bytes without interpreting or rewriting ownership evidence', async () => {
  const root = await fixture();
  const bytes = Buffer.from('{"historical":"unchanged bytes"}\r\n');
  await writeFile(join(root, '.arch/uninstall.json'), bytes);
  const evidence = await recoveryEvidence(root);
  expect(evidence).toHaveLength(4);
  expect(evidence.find((entry) => 'uninstall.json' === entry.name)).toEqual({
    name: 'uninstall.json',
    bytes: bytes.length,
    base64: bytes.toString('base64'),
    truncated: false,
  });
  const missing = evidence.find((entry) => 'bootstrap.json' === entry.name);
  if (!missing || !('observationError' in missing)) {
    throw new Error('Missing file diagnostic');
  }
  expect(missing.observationError).toContain('ENOENT');
  expect(await readFile(join(root, '.arch/uninstall.json'))).toEqual(bytes);
});

it('does not traverse a metadata-root symlink into unrelated content', async () => {
  const root = await fixture();
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'routing.json'), 'private canary');
  await rm(join(root, '.arch'), { recursive: true });
  await symlink(outside, join(root, '.arch'), 'win32' === process.platform ? 'junction' : 'dir');
  for (const entry of await recoveryEvidence(root)) {
    expect('base64' in entry).toBe(false);
    if (!('observationError' in entry)) {
      throw new Error('Missing symlink refusal');
    }
    expect(entry.observationError).toContain('Refusing managed symlink');
  }
  expect(await readFile(join(outside, 'routing.json'), 'utf8')).toBe('private canary');
});

it('refuses oversized or non-file authority snapshots instead of emitting unbounded output', async () => {
  const root = await fixture();
  await writeFile(join(root, '.arch/routing.json'), Buffer.alloc(1024 * 1024 + 1));
  await mkdir(join(root, '.arch/routing.stage'));
  const evidence = await recoveryEvidence(root);
  for (const name of ['routing.json', 'routing.stage']) {
    const entry = evidence.find((candidate) => candidate.name === name);
    expect(entry).toMatchObject({ name, notRead: true });
    expect(entry && 'base64' in entry).toBe(false);
  }
});
