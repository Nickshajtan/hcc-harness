import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, unlink, rename, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup, stateFrom, digest } from '../../src/setup.js';
import { reconcileRoutes, inspectInstallation, deinitialize } from '../../src/lifecycle.js';
import { journalFrom } from '../../src/lifecycle/routing-journal.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: vi.fn(actual.writeFile),
    unlink: vi.fn(actual.unlink),
    rename: vi.fn(actual.rename),
    link: vi.fn(actual.link),
  };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
let root: string;
const desired = ['retained', 'added'];
const route = (name: string) => `.arch/bin/${name}${'win32' === process.platform ? '.exe' : ''}`;
const file = (name: string) => join(root, name);
beforeEach(async () => {
  vi.mocked(writeFile).mockImplementation(actual.writeFile);
  vi.mocked(unlink).mockImplementation(actual.unlink);
  vi.mocked(rename).mockImplementation(actual.rename);
  vi.mocked(link).mockImplementation(actual.link);
  root = await mkdtemp(join(tmpdir(), 'arch-effect-contract-'));
  await setup(root, ['retained', 'removed']);
  await actual.writeFile(file('user.txt'), 'unrelated');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function verifyRecovered() {
  await reconcileRoutes(root, desired);
  const state = stateFrom(await readFile(file('.arch/bootstrap.json')));
  for (const [path, hash] of Object.entries(state.files)) {
    expect(digest(await readFile(file(path)))).toBe(hash);
  }
  expect(await inspectInstallation(root, { PATH: '' })).toMatchObject({
    state: 'initialized',
    routes: desired,
    recoveryPending: false,
  });
  const bytes = await readFile(file('.arch/bootstrap.json'));
  await reconcileRoutes(root, desired);
  expect(await readFile(file('.arch/bootstrap.json'))).toEqual(bytes);
  expect(await readFile(file('user.txt'), 'utf8')).toBe('unrelated');
}

it.each([
  'journal publication',
  'launcher publication',
  'manifest replacement',
  'route removal',
  'stage cleanup',
  'journal cleanup',
])('preserves authority and original OS cause after failure during %s', async (phase) => {
  const before = await readFile(file('.arch/bootstrap.json'));
  const retained = await readFile(file(route('retained')));
  const failure = Object.assign(new Error(`injected ${phase}`), { code: 'EACCES' });
  vi.mocked(link).mockImplementation(async (source, target) => {
    if (
      target.toString() ===
        file('journal publication' === phase ? '.arch/routing.json' : route('added')) &&
      phase.includes('publication')
    ) {
      throw failure;
    }
    await actual.link(source, target);
  });
  vi.mocked(rename).mockImplementation(async (source, target) => {
    if ('manifest replacement' === phase) {
      throw failure;
    }
    await actual.rename(source, target);
  });
  vi.mocked(unlink).mockImplementation(async (target) => {
    const path = target.toString();
    if (
      ('route removal' === phase && path === file(route('removed'))) ||
      ('stage cleanup' === phase && path.endsWith('-0.stage')) ||
      ('journal cleanup' === phase && path === file('.arch/routing.json'))
    ) {
      throw failure;
    }
    await actual.unlink(target);
  });
  const error: unknown = await reconcileRoutes(root, desired).catch((value: unknown) => value);
  expect(error).toBeInstanceOf(Error);
  expect(error === failure || (error instanceof Error && error.cause === failure)).toBe(true);
  expect(await readFile(file(route('retained')))).toEqual(retained);
  expect(await readFile(file('user.txt'), 'utf8')).toBe('unrelated');
  if ('journal publication' === phase) {
    expect(await readFile(file('.arch/bootstrap.json'))).toEqual(before);
    await expect(readFile(file('.arch/routing.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    // No journal grants authority over this orphan; only the fixture owner removes it.
    await actual.unlink(file('.arch/routing.stage'));
  } else {
    const recorded = await readFile(file('.arch/routing.json'));
    expect(journalFrom(recorded).after.files[route('added')]).toBeTypeOf('string');
    expect((await inspectInstallation(root, { PATH: '' })).state).toBe('recovery_pending');
    await expect(reconcileRoutes(root, ['different'])).rejects.toThrow('Routing recovery pending');
    expect(await readFile(file('.arch/routing.json'))).toEqual(recorded);
  }
  vi.mocked(link).mockImplementation(actual.link);
  vi.mocked(rename).mockImplementation(actual.rename);
  vi.mocked(unlink).mockImplementation(actual.unlink);
  await verifyRecovered();
});

it('preserves partial private writes and refuses to guess their ownership', async () => {
  const failure = Object.assign(new Error('partial disk write'), { code: 'ENOSPC' });
  vi.mocked(writeFile).mockImplementation(async (target, bytes, options) => {
    if ('string' === typeof target && target.endsWith('-0.stage')) {
      await actual.writeFile(target, 'partial', options);
      throw failure;
    }
    await actual.writeFile(target, bytes, options);
  });
  await expect(reconcileRoutes(root, desired)).rejects.toBe(failure);
  const journal = journalFrom(await readFile(file('.arch/routing.json')));
  const stage = file(`.arch/.routing-${journal.id}-0.stage`);
  vi.mocked(writeFile).mockImplementation(actual.writeFile);
  await expect(reconcileRoutes(root, desired)).rejects.toThrow(
    'staging file changed or incomplete',
  );
  expect(await readFile(stage, 'utf8')).toBe('partial');
  const payload = Object.values(journal.additions)[0];
  if (undefined === payload) {
    throw new Error('Expected addition payload');
  }
  await actual.writeFile(stage, Buffer.from(payload, 'base64'));
  await verifyRecovered();
});

it('never clobbers a destination appearing after staging', async () => {
  await expect(
    reconcileRoutes(root, desired, {
      async checkpoint(phase) {
        if (`staged:${route('added')}` === phase) {
          await actual.writeFile(file(route('added')), 'user collision');
        }
      },
    }),
  ).rejects.toThrow('Managed file changed');
  expect(await readFile(file(route('added')), 'utf8')).toBe('user collision');
  expect(await readFile(file(route('removed')))).toBeDefined();
  await expect(deinitialize(root)).rejects.toThrow('Managed file changed');
  expect(await readFile(file('user.txt'), 'utf8')).toBe('unrelated');
});
