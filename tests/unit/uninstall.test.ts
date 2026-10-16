import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setup, uninstall } from '../../src/setup.js';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, unlink: vi.fn(actual.unlink) };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
let root: string;
beforeEach(async () => {
  vi.mocked(unlink).mockImplementation(actual.unlink);
  await mkdir('.test-state', { recursive: true });
  root = await mkdtemp(resolve('.test-state/uninstall-'));
  await setup(root, ['tool']);
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const stateFile = () => join(root, '.arch/bootstrap.json');
const journalFile = () => join(root, '.arch/uninstall.json');
const routeFile = () => join(root, '.config/mise/conf.d/arch.toml');

it('recovers after interruption following deletion of a managed file', async () => {
  await rename(stateFile(), journalFile());
  await actual.unlink(routeFile());
  await uninstall(root);
  await expect(readFile(join(root, '.arch/bin/.arch-router'))).rejects.toThrow();
  await expect(readFile(journalFile())).rejects.toThrow();
  await expect(readFile(join(root, '.arch/harness.toml'))).rejects.toThrow();
  await uninstall(root);
});

it('can retry a deletion failure with operation-specific diagnostics', async () => {
  let calls = 0;
  vi.mocked(unlink).mockImplementation(async path => {
    if (++calls === 2) throw Object.assign(new Error('injected permission failure'), { code: 'EACCES' });
    await actual.unlink(path);
  });
  await expect(uninstall(root)).rejects.toThrow('remove managed file');
  await expect(readFile(routeFile())).rejects.toThrow();
  expect(await readFile(journalFile(), 'utf8')).toContain('files');
  vi.mocked(unlink).mockImplementation(actual.unlink);
  await uninstall(root);
  await expect(readFile(journalFile())).rejects.toThrow();
});

it('retries a final state removal failure after all managed files are gone', async () => {
  vi.mocked(unlink).mockImplementation(async path => {
    if (path === journalFile()) throw new Error('state locked');
    await actual.unlink(path);
  });
  await expect(uninstall(root)).rejects.toThrow('remove uninstall state');
  vi.mocked(unlink).mockImplementation(actual.unlink);
  await uninstall(root); await uninstall(root);
  await expect(readFile(journalFile())).rejects.toThrow();
});

it('does not accept arbitrary missing files before an uninstall has begun', async () => {
  await actual.unlink(routeFile());
  await expect(uninstall(root)).rejects.toThrow('Managed file changed');
  expect(await readFile(stateFile(), 'utf8')).toContain('files');
});

it('preserves modified files during recovery and can continue after they are restored', async () => {
  const route = await readFile(routeFile());
  await rename(stateFile(), journalFile());
  await writeFile(routeFile(), 'user changes');
  await expect(uninstall(root)).rejects.toThrow('Managed file changed');
  expect(await readFile(routeFile(), 'utf8')).toBe('user changes');
  expect(await readFile(join(root, '.arch/bin/.arch-router'), 'utf8')).toContain('arch-harness');
  await writeFile(routeFile(), route); await uninstall(root);
});

it('preserves unrelated files and edited harness configuration', async () => {
  await writeFile(join(root, '.arch/notes.txt'), 'user data');
  await writeFile(join(root, '.arch/harness.toml'), 'schema=1\nmiddleware=[]');
  await uninstall(root); await uninstall(root);
  expect(await readFile(join(root, '.arch/notes.txt'), 'utf8')).toBe('user data');
  expect(await readFile(join(root, '.arch/harness.toml'), 'utf8')).toContain('middleware=[]');
});

it('refuses initialization while uninstall recovery is pending', async () => {
  await rename(stateFile(), journalFile());
  await expect(setup(root, ['tool'])).rejects.toThrow('Uninstall in progress');
});

it('preserves preexisting configuration and unknown files in mise directories', async () => {
  await uninstall(root);
  const harness = join(root, '.arch/harness.toml');
  const text = 'schema=1\n# created by the user\nmiddleware=[]\n';
  await writeFile(harness, text);
  await writeFile(join(root, '.config/mise/conf.d/other.toml'), '# user mise config');
  await setup(root, ['tool']); await uninstall(root);
  expect(await readFile(harness, 'utf8')).toBe(text);
  expect(await readFile(join(root, '.config/mise/conf.d/other.toml'), 'utf8')).toContain('user mise');
});

it('does not overwrite conflicting recovery state or accept invalid state paths', async () => {
  await writeFile(journalFile(), 'user data');
  await expect(uninstall(root)).rejects.toThrow('Conflicting');
  expect(await readFile(journalFile(), 'utf8')).toBe('user data');
  await actual.unlink(journalFile());
  await writeFile(stateFile(), JSON.stringify({ files: { '../user.txt': 'a'.repeat(64) }, createdHarness: true }));
  await expect(uninstall(root)).rejects.toThrow('Invalid bootstrap state');
  expect(await readFile(routeFile(), 'utf8')).toContain('Generated by Arch');
});
