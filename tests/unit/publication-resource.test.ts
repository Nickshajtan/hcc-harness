import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicationHelper, renameNoReplace } from '../../src/lifecycle/native-publication.js';
import { installationKind } from '../../src/installation/stable-layout.js';
import { digest } from '../../src/lifecycle/manifest.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

let root: string;
const originalPlatform = process.platform,
  originalArch = process.arch;
beforeEach(async () => {
  vi.mocked(readFile).mockImplementation(actual.readFile);
  root = await mkdtemp(join(tmpdir(), 'arch-publication-resource-'));
  // Resource-layout validation is platform-independent I/O; only capability
  // selection is forced. This does not execute or simulate a Windows syscall.
  Object.defineProperty(process, 'platform', { value: 'win32' });
  Object.defineProperty(process, 'arch', { value: 'x64' });
});
it('classifies helper resource access failure before process invocation with its original cause', async () => {
  const failure = new Error('package metadata unavailable');
  vi.mocked(readFile).mockRejectedValueOnce(failure);
  await expect(renameNoReplace(join(root, 'stage'), join(root, 'target'))).rejects.toMatchObject({
    kind: 'execution',
    outcome: 'not-published',
    cause: failure,
  });
});
afterEach(async () => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  Object.defineProperty(process, 'arch', { value: originalArch });
  await rm(root, { recursive: true, force: true });
});
async function stable() {
  await mkdir(join(root, 'application/dist/lifecycle'), { recursive: true });
  await mkdir(join(root, 'application/vendor'));
  await mkdir(join(root, '.arch-ready'));
  await writeFile(
    join(root, 'application/package.json'),
    JSON.stringify({ archStableSnapshot: installationKind }),
  );
  await writeFile(join(root, 'application/vendor/arch-publication-v1.exe'), 'controlled helper');
  await writeFile(
    join(root, 'installation.json'),
    JSON.stringify({
      kind: installationKind,
      platform: 'win32',
      files: { 'application/vendor/arch-publication-v1.exe': digest('controlled helper') },
    }),
  );
  return pathToFileURL(join(root, 'application/dist/lifecycle/native-publication.js'));
}
it('locates and verifies a relocated stable helper without source paths', async () => {
  const module = await stable();
  expect(await publicationHelper(module)).toBe(
    join(root, 'application/vendor/arch-publication-v1.exe'),
  );
});
it.each([
  null,
  {},
  { kind: 'wrong', platform: 'win32' },
  { kind: installationKind, platform: 'linux' },
])('refuses invalid installation authority %j', async (record) => {
  const module = await stable();
  await writeFile(join(root, 'installation.json'), JSON.stringify(record));
  await expect(publicationHelper(module)).rejects.toThrow('Incomplete stable installation');
});
it.each([
  {},
  { files: null },
  { files: [] },
  { files: { 'application/vendor/arch-publication-v1.exe': 42 } },
  { files: { 'application/vendor/arch-publication-v1.exe': 'incorrect' } },
])('refuses missing or invalid helper checksum %j', async (extra) => {
  const module = await stable();
  await writeFile(
    join(root, 'installation.json'),
    JSON.stringify({ kind: installationKind, platform: 'win32', ...extra }),
  );
  await expect(publicationHelper(module)).rejects.toThrow('integrity failure');
});
it.each(['missing', 'corrupt', 'directory', 'symlink'])(
  'refuses %s helper resources',
  async (kind) => {
    const module = await stable(),
      helper = join(root, 'application/vendor/arch-publication-v1.exe');
    await rm(helper);
    if ('corrupt' === kind) {
      await writeFile(helper, 'changed');
    }
    if ('directory' === kind) {
      await mkdir(helper);
    }
    if ('symlink' === kind) {
      await mkdir(join(root, 'foreign'));
      await symlink(
        join(root, 'foreign'),
        helper,
        'win32' === originalPlatform ? 'junction' : 'dir',
      );
    }
    await expect(publicationHelper(module)).rejects.toThrow();
  },
);
it.each(['file', 'symlink'])('refuses a %s readiness marker', async (kind) => {
  const module = await stable();
  await rm(join(root, '.arch-ready'), { recursive: true });
  if ('file' === kind) {
    await writeFile(join(root, '.arch-ready'), 'foreign');
  } else {
    await mkdir(join(root, 'foreign'));
    await symlink(
      join(root, 'foreign'),
      join(root, '.arch-ready'),
      'win32' === originalPlatform ? 'junction' : 'dir',
    );
  }
  await expect(publicationHelper(module)).rejects.toThrow('Incomplete stable installation');
});
it.each([1, 2, null])('validates development provenance protocol %j', async (protocol) => {
  await mkdir(join(root, 'dist/lifecycle'), { recursive: true });
  await mkdir(join(root, '.tools/publication'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{}');
  await writeFile(join(root, '.tools/publication/arch-publication-v1.exe'), 'controlled helper');
  await writeFile(
    join(root, '.tools/publication/provenance.json'),
    JSON.stringify({ protocol, sha256: digest('controlled helper') }),
  );
  const result = publicationHelper(
    pathToFileURL(join(root, 'dist/lifecycle/native-publication.js')),
  );
  if (1 === protocol) {
    expect(await result).toBe(join(root, '.tools/publication/arch-publication-v1.exe'));
  } else {
    await expect(result).rejects.toThrow('integrity failure');
  }
  expect(await readFile(join(root, '.tools/publication/arch-publication-v1.exe'), 'utf8')).toBe(
    'controlled helper',
  );
});
it.each(['platform', 'architecture'])(
  'rejects unsupported %s without loading resources',
  async (unsupported) => {
    Object.defineProperty(process, 'platform', {
      value: 'platform' === unsupported ? 'linux' : 'win32',
    });
    Object.defineProperty(process, 'arch', {
      value: 'architecture' === unsupported ? 'arm64' : 'x64',
    });
    await expect(publicationHelper()).rejects.toMatchObject({
      kind: 'unsupported',
      outcome: 'not-published',
    });
    await expect(renameNoReplace(join(root, 'stage'), join(root, 'target'))).rejects.toMatchObject({
      kind: 'unsupported',
      outcome: 'not-published',
    });
  },
);
