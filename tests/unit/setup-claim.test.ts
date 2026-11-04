import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat, rmdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup, uninstall } from '../../src/setup.js';
import {
  inspectInstallation,
  reconcileRoutes,
  deinitialize,
  planRoutes,
} from '../../src/lifecycle.js';
import {
  assertBootstrapAuthority,
  claimSetup,
  setupClaimPath,
} from '../../src/lifecycle/setup-claim.js';
import { stateFrom } from '../../src/lifecycle/manifest.js';
import { checkFiles } from '../../src/lifecycle/ownership.js';
import { applyJournal } from '../../src/lifecycle/recovery.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, rmdir: vi.fn(actual.rmdir), lstat: vi.fn(actual.lstat) };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
let root: string;
beforeEach(async () => {
  vi.mocked(rmdir).mockImplementation(actual.rmdir);
  vi.mocked(lstat).mockImplementation(actual.lstat);
  root = await mkdtemp(join(tmpdir(), 'arch-claim-'));
});
afterEach(async () => {
  vi.mocked(rmdir).mockImplementation(actual.rmdir);
  vi.mocked(lstat).mockImplementation(actual.lstat);
  await rm(root, { recursive: true, force: true });
});

it.each(['empty', 'partial', 'corrupt', 'file'])(
  'blocks every authority consumer with a %s claim without changing managed bytes',
  async (kind) => {
    await setup(root, ['tool']);
    const bootstrap = await readFile(join(root, '.arch/bootstrap.json'));
    const state = stateFrom(bootstrap);
    if ('file' === kind) {
      await writeFile(join(root, setupClaimPath), 'invalid');
    } else {
      await mkdir(join(root, setupClaimPath));
      if ('empty' !== kind) {
        await writeFile(
          join(root, setupClaimPath, 'evidence'),
          'partial' === kind ? '{' : 'invalid',
        );
      }
    }
    expect((await inspectInstallation(root, {})).state).toBe('invalid_state');
    for (const operation of [
      () => setup(root, ['tool']),
      () => planRoutes(root, ['other']),
      () => reconcileRoutes(root, ['other']),
      () => uninstall(root),
      () => deinitialize(root),
    ]) {
      await expect(operation()).rejects.toThrow('Unresolved setup claim');
      expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(bootstrap);
      await checkFiles(root, state.files);
    }
  },
);

it('releases only the invocation-owned empty directory', async () => {
  await mkdir(join(root, '.arch'));
  const release = await claimSetup(root);
  await expect(assertBootstrapAuthority(root)).rejects.toThrow('Unresolved setup claim');
  await expect(claimSetup(root)).rejects.toThrow('Unresolved setup claim');
  await release();
  await assertBootstrapAuthority(root);
});

it('blocks existing routing recovery before publishing or removing resources', async () => {
  await setup(root, ['tool']);
  const bootstrap = await readFile(join(root, '.arch/bootstrap.json'));
  const plan = await planRoutes(root, ['other']);
  const journal = { schema: 1 as const, id: 'claim-recovery', ...plan };
  const bytes = JSON.stringify(journal);
  await writeFile(join(root, '.arch/routing.json'), bytes);
  await mkdir(join(root, setupClaimPath));
  for (const operation of [
    () => applyJournal(root, journal, {}),
    () => reconcileRoutes(root, ['other']),
    () => deinitialize(root),
  ]) {
    await expect(operation()).rejects.toThrow('Unresolved setup claim');
    expect(await readFile(join(root, '.arch/routing.json'), 'utf8')).toBe(bytes);
    expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(bootstrap);
    await checkFiles(root, stateFrom(bootstrap).files);
  }
});

it('preserves a substituted claim identity', async () => {
  await mkdir(join(root, '.arch'));
  const release = await claimSetup(root);
  await rename(join(root, setupClaimPath), join(root, '.arch/original-claim'));
  await mkdir(join(root, setupClaimPath));
  await expect(release()).rejects.toThrow('Setup claim identity changed');
  await expect(assertBootstrapAuthority(root)).rejects.toThrow('Unresolved setup claim');
});

it('preserves a nonempty guard and committed resources after claim cleanup fails', async () => {
  vi.mocked(rmdir).mockImplementation(async (path, options) => {
    if (String(path).endsWith('setup-claim')) {
      await writeFile(join(String(path), 'foreign'), 'preserve');
    }
    return actual.rmdir(path, options);
  });
  await expect(setup(root, ['tool'])).rejects.toThrow('setup committed');
  const bootstrap = await readFile(join(root, '.arch/bootstrap.json'));
  await checkFiles(root, stateFrom(bootstrap).files);
  expect(await readFile(join(root, setupClaimPath, 'foreign'), 'utf8')).toBe('preserve');
  await expect(setup(root, ['tool'])).rejects.toThrow('Unresolved setup claim');
  await expect(deinitialize(root)).rejects.toThrow('Unresolved setup claim');
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(bootstrap);
});

it('keeps the guard when identical bootstrap bytes are substituted before commit cleanup', async () => {
  let substituted = false;
  vi.mocked(rmdir).mockImplementation(async (path, options) => {
    await actual.rmdir(path, options);
    if (String(path).includes('.setup-')) {
      const bootstrap = join(root, '.arch/bootstrap.json');
      const bytes = await readFile(bootstrap);
      // Keep the original object alive at another path to rule out ID reuse.
      await rename(bootstrap, join(root, '.arch/original-bootstrap'));
      await writeFile(bootstrap, bytes, { flag: 'wx' });
      substituted = true;
    }
  });
  await expect(setup(root, ['tool'])).rejects.toThrow('setup committed');
  expect(substituted).toBe(true);
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(
    await readFile(join(root, '.arch/original-bootstrap')),
  );
  await expect(deinitialize(root)).rejects.toThrow('Unresolved setup claim');
  expect((await inspectInstallation(root, {})).state).toBe('invalid_state');
});

it('does not interpret an unreadable guard as absent', async () => {
  const failure = Object.assign(new Error('claim access denied'), { code: 'EACCES' });
  vi.mocked(lstat).mockRejectedValue(failure);
  await expect(assertBootstrapAuthority(root)).rejects.toBe(failure);
});

it('preserves an inspection error after safe-path validation succeeds', async () => {
  await mkdir(join(root, '.arch'));
  await mkdir(join(root, setupClaimPath));
  const failure = Object.assign(new Error('claim inspection failed'), { code: 'EIO' });
  let observations = 0;
  vi.mocked(lstat).mockImplementation((...args) => {
    if (3 === ++observations) {
      return Promise.reject(failure);
    }
    return actual.lstat(...args);
  });
  await expect(assertBootstrapAuthority(root)).rejects.toBe(failure);
  expect(await actual.lstat(join(root, setupClaimPath))).toBeDefined();
});

it('preserves the historical no-claim ownership contract', async () => {
  await setup(root, ['tool']);
  await expect(actual.lstat(join(root, setupClaimPath))).rejects.toMatchObject({ code: 'ENOENT' });
  const bootstrap = await readFile(join(root, '.arch/bootstrap.json'));
  await setup(root, ['tool']);
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(bootstrap);
  expect((await inspectInstallation(root, {})).state).toBe('initialized');
  await reconcileRoutes(root, ['tool', 'other']);
  await deinitialize(root);
  await expect(readFile(join(root, '.arch/bootstrap.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
