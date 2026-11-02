import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  installationKind,
  snapshotRoot,
  stableEntry,
} from '../../src/installation/stable-layout.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
beforeEach(() => {
  vi.mocked(readFile).mockReset().mockImplementation(actual.readFile);
});

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'arch-stable-layout-'));
  roots.push(root);
  return { root, url: pathToFileURL(root + '/') };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});
it('refuses missing snapshot metadata while preserving development rendering', async () => {
  const { url } = await fixture();
  await expect(stableEntry(url)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await stableEntry()).toBeUndefined();
});
it('does not inspect unrelated parent metadata from a development checkout', async () => {
  vi.mocked(readFile).mockImplementation(async (...args) => {
    if (args[0] instanceof URL && args[0].pathname.endsWith('/installation.json')) {
      throw new Error('unrelated parent metadata must not be read');
    }
    return actual.readFile(...args);
  });
  expect(await stableEntry()).toBeUndefined();
  expect(
    vi
      .mocked(readFile)
      .mock.calls.some(
        ([path]) => path instanceof URL && path.pathname.endsWith('/installation.json'),
      ),
  ).toBe(false);
});
it.each(['file:///opt/Arch%20App/', 'file:///C:/Users/Example/Arch%20App/'])(
  'uses the explicit snapshot package identity under %s',
  (root) => {
    expect(
      snapshotRoot(
        { archStableSnapshot: installationKind },
        new URL('application/dist/installation/stable-layout.js', root),
      )?.href,
    ).toBe(root);
    for (const module of [
      'checkout/dist/installation/stable-layout.js',
      'src/installation/stable-layout.ts',
      'application/src/installation/stable-layout.ts',
    ]) {
      expect(snapshotRoot({}, new URL(module, root))).toBeUndefined();
    }
  },
);
it.each([null, [], 'invalid', { archStableSnapshot: 'unknown' }])(
  'does not infer a snapshot from unknown package metadata %j',
  (metadata) => {
    const moduleUrl = new URL('file:///root/application/dist/installation/stable-layout.js');
    if (metadata && 'object' === typeof metadata && 'archStableSnapshot' in metadata) {
      expect(() => snapshotRoot(metadata, moduleUrl)).toThrow(
        'Invalid Arch snapshot package marker',
      );
    } else {
      expect(snapshotRoot(metadata, moduleUrl)).toBeUndefined();
    }
  },
);
it('keeps the completion kind stable and propagates unexpected read errors', async () => {
  expect(installationKind).toBe('arch-stable-installation-v1');
  const { url } = await fixture();
  for (const error of [
    new Error('read failed'),
    Object.assign(new Error('denied'), { code: 'EACCES' }),
  ]) {
    vi.mocked(readFile).mockRejectedValueOnce(error);
    await expect(stableEntry(url)).rejects.toBe(error);
  }
});
it('selects the stable bootstrap only for a complete same-platform installation', async () => {
  const { root, url } = await fixture();
  await writeFile(
    join(root, 'installation.json'),
    JSON.stringify({ kind: installationKind, platform: process.platform }),
  );
  await mkdir(join(root, '.arch-ready'));
  expect(await stableEntry(url)).toBe(
    join(root, 'win32' === process.platform ? 'arch.exe' : 'arch'),
  );
});
it.each([
  null,
  [],
  {},
  { kind: 'unknown' },
  { kind: installationKind },
  { kind: 'unknown', platform: process.platform },
  { kind: installationKind, platform: 'foreign' },
])('refuses ambiguous stable metadata %j', async (metadata) => {
  const { root, url } = await fixture();
  await writeFile(join(root, 'installation.json'), JSON.stringify(metadata));
  await mkdir(join(root, '.arch-ready'));
  await expect(stableEntry(url)).rejects.toThrow('Invalid stable');
});
it('refuses malformed, incomplete and symlinked completion states without mutation', async () => {
  const { root, url } = await fixture();
  const marker = join(root, 'installation.json');
  await writeFile(marker, '{broken');
  await expect(stableEntry(url)).rejects.toBeInstanceOf(SyntaxError);
  await writeFile(marker, JSON.stringify({ kind: installationKind, platform: process.platform }));
  await expect(stableEntry(url)).rejects.toMatchObject({ code: 'ENOENT' });
  await writeFile(join(root, '.arch-ready'), 'not a directory');
  await expect(stableEntry(url)).rejects.toThrow('Invalid stable');
  await rm(join(root, '.arch-ready'));
  await mkdir(join(root, 'foreign'));
  await symlink(
    join(root, 'foreign'),
    join(root, '.arch-ready'),
    'win32' === process.platform ? 'junction' : 'dir',
  );
  await expect(stableEntry(url)).rejects.toThrow('Invalid stable');
  expect(await readFile(marker, 'utf8')).toContain(installationKind);
});
