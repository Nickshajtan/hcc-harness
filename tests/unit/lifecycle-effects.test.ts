import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  unlink,
  rename,
  link,
  mkdir,
  symlink,
  readdir,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { setup, stateFrom, digest, uninstall } from '../../src/setup.js';
import {
  reconcileRoutes,
  inspectInstallation,
  deinitialize,
  planRoutes,
} from '../../src/lifecycle.js';
import { journalFrom } from '../../src/lifecycle/routing-journal.js';
import { stage, removeOptional, publishExclusive } from '../../src/lifecycle/routing-files.js';

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

it('plans retained, new and removed resources without mutating disk or accepting invalid requests', async () => {
  const before = await readFile(file('.arch/bootstrap.json'));
  const plan = await planRoutes(root, desired);
  expect(plan.removed).toEqual(
    'win32' === process.platform
      ? [route('removed'), '.arch/bin/removed.shim']
      : [route('removed')],
  );
  expect(Object.keys(plan.additions)).toEqual(
    'win32' === process.platform ? [route('added'), '.arch/bin/added.shim'] : [route('added')],
  );
  expect(plan.after.files[route('retained')]).toBe(plan.before.files[route('retained')]);
  expect(await readFile(file('.arch/bootstrap.json'))).toEqual(before);
  await expect(planRoutes(root, ['../unsafe'])).rejects.toThrow('Supply unique executable names');
  await expect(planRoutes(file('missing'), desired)).rejects.toThrow('Arch is not initialized');
});

it.each(['.arch/routing.json', '.arch/uninstall.json'])(
  'planning refuses a persisted operation before inspecting new resources: %s',
  async (path) => {
    await actual.writeFile(file(path), 'persisted authority');
    await expect(planRoutes(root, desired)).rejects.toThrow(
      'Recovery pending; finish the recorded operation first',
    );
    expect(await readFile(file(path), 'utf8')).toBe('persisted authority');
    if ('.arch/routing.json' === path) {
      await expect(uninstall(root)).rejects.toThrow(
        'Routing recovery pending; finish configure before uninstall',
      );
    }
  },
);

it('initialization rejects different route sets and collisions while accepting reordered recorded paths', async () => {
  const bytes = await readFile(file('.arch/bootstrap.json'));
  await expect(setup(root, ['different'])).rejects.toThrow('Arch setup differs; use configure');
  await expect(setup(root, ['replacement', 'retained'])).rejects.toThrow(
    'Arch setup differs; use configure',
  );
  expect(await readFile(file('.arch/bootstrap.json'))).toEqual(bytes);
  await setup(root, ['removed', 'retained']);
  expect(await readFile(file('.arch/bootstrap.json'))).toEqual(bytes);
  await uninstall(root);
  await actual.writeFile(file(route('retained')), 'unowned');
  await expect(setup(root, ['retained'])).rejects.toThrow(
    `Refusing to overwrite ${route('retained')}`,
  );
  expect(await readFile(file(route('retained')), 'utf8')).toBe('unowned');
});

it('refuses a valid foreign-platform manifest before filesystem mutation', async () => {
  const state = stateFrom(await readFile(file('.arch/bootstrap.json')));
  const files = Object.fromEntries(
    Object.entries(state.files).filter(
      ([path]) => !path.includes('/retained') && !path.includes('/removed'),
    ),
  );
  const paths =
    'win32' === process.platform
      ? ['.arch/bin/foreign']
      : ['.arch/bin/foreign.exe', '.arch/bin/foreign.shim'];
  for (const path of paths) {
    files[path] = digest('historical launcher');
  }
  const bytes = JSON.stringify({ ...state, files });
  await actual.writeFile(file('.arch/bootstrap.json'), bytes);
  await expect(planRoutes(root, ['foreign'])).rejects.toThrow(
    'Foreign-platform installation; deinitialize on its original platform',
  );
  expect(await readFile(file('.arch/bootstrap.json'), 'utf8')).toBe(bytes);
});

it('direct setup and uninstall refuse a symlinked metadata root without touching its target', async () => {
  const outside = file('outside');
  await mkdir(outside);
  await actual.writeFile(join(outside, 'user.txt'), 'keep');
  await actual.rename(file('.arch'), file('saved-arch'));
  await symlink(outside, file('.arch'), 'win32' === process.platform ? 'junction' : 'dir');
  await expect(setup(root, ['tool'])).rejects.toThrow('Refusing managed symlink');
  await expect(uninstall(root)).rejects.toThrow('Refusing managed symlink');
  expect(await readFile(join(outside, 'user.txt'), 'utf8')).toBe('keep');
});

it('rechecks obsolete bytes after the journal checkpoint and preserves the conflicting resource', async () => {
  const original = await readFile(file(route('removed')));
  await expect(
    reconcileRoutes(root, desired, {
      async checkpoint(phase) {
        if ('journal' === phase) {
          await actual.writeFile(file(route('removed')), 'modified after validation');
        }
      },
    }),
  ).rejects.toThrow(`Managed file changed: ${route('removed')}`);
  expect(await readFile(file(route('removed')), 'utf8')).toBe('modified after validation');
  await actual.writeFile(file(route('removed')), original);
  await verifyRecovered();
});

it('uses the exact manifest stage name and publishes executable POSIX launchers', async () => {
  await reconcileRoutes(root, desired, {
    async checkpoint(phase) {
      if ('before-manifest' !== phase) {
        return;
      }
      const journal = journalFrom(await readFile(file('.arch/routing.json')));
      expect(await readdir(file('.arch'))).toContain(`.routing-${journal.id}-manifest.stage`);
      if ('win32' !== process.platform) {
        expect((await stat(file(route('added')))).mode & 0o111).toBe(0o111);
        expect((await stat(file(`.arch/.routing-${journal.id}-manifest.stage`))).mode & 0o111).toBe(
          0,
        );
        expect((await stat(file('.arch/routing.stage'))).mode & 0o111).toBe(0);
      }
    },
  });
  await verifyRecovered();
});

it('retains the removal checkpoint and operation-specific cause if generated configuration removal fails', async () => {
  const failure = Object.assign(new Error('configuration locked'), { code: 'EBUSY' });
  vi.mocked(unlink).mockImplementation(async (path) => {
    if (path === file('.arch/harness.toml')) {
      throw failure;
    }
    await actual.unlink(path);
  });
  await expect(uninstall(root)).rejects.toMatchObject({
    message: `Unable to remove generated configuration: ${file('.arch/harness.toml')}`,
    cause: failure,
  });
  expect(await readFile(file('.arch/uninstall.json'))).toBeDefined();
  vi.mocked(unlink).mockImplementation(actual.unlink);
  await uninstall(root);
  expect(await readFile(file('user.txt'), 'utf8')).toBe('unrelated');
});

it('keeps staging exclusive against a file appearing between verification and write', async () => {
  const path = '.arch/collision.stage';
  vi.mocked(writeFile).mockImplementation(async (target, bytes, options) => {
    if (target === file(path)) {
      await actual.writeFile(target, 'unowned stage', { flag: 'wx' });
    }
    await actual.writeFile(target, bytes, options);
  });
  await expect(stage(root, path, Buffer.from('desired stage'))).rejects.toMatchObject({
    code: 'EEXIST',
  });
  expect(await readFile(file(path), 'utf8')).toBe('unowned stage');
});

it('accepts an already complete private stage without attempting exclusive recreation', async () => {
  const path = '.arch/complete.stage';
  const bytes = Buffer.from('complete');
  await actual.writeFile(file(path), bytes, { flag: 'wx' });
  await stage(root, path, bytes);
  expect(await readFile(file(path))).toEqual(bytes);
});

it('preserves routing removal diagnostics and code-less publication causes', async () => {
  const failure = new Error('external failure without an errno');
  vi.mocked(unlink).mockRejectedValue(failure);
  await expect(removeOptional(root, 'user.txt')).rejects.toMatchObject({
    message: 'Unable to remove routing resource: user.txt',
    cause: failure,
  });
  expect(await readFile(file('user.txt'), 'utf8')).toBe('unrelated');
  vi.mocked(link).mockRejectedValue(failure);
  const error: unknown = await publishExclusive(root, '.arch/complete.stage', route('added')).catch(
    (value: unknown) => value,
  );
  if (!(error instanceof Error)) {
    throw new Error('Expected publication refusal');
  }
  expect(error.message).toContain('exclusively (unknown error)');
  expect(error.cause).toBe(failure);
});

it('preserves initial exclusive creation against a late destination collision', async () => {
  const fresh = file('fresh');
  await mkdir(fresh);
  const collision = join(fresh, '.config/mise/conf.d/arch.toml');
  vi.mocked(writeFile).mockImplementation(async (target, bytes, options) => {
    if (target === collision) {
      await actual.writeFile(target, 'unowned integration', { flag: 'wx' });
    }
    await actual.writeFile(target, bytes, options);
  });
  await expect(setup(fresh, ['tool'])).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readFile(collision, 'utf8')).toBe('unowned integration');
  await expect(readFile(join(fresh, '.arch/bootstrap.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  await expect(setup(root, ['../unsafe'])).rejects.toThrow('Supply unique executable names');
});

it('preserves recorded route spelling and platform-specific command identity in a plan', async () => {
  const plan = await planRoutes(root, ['RETAINED', 'added']);
  const retainedPath = route('win32' === process.platform ? 'retained' : 'RETAINED');
  expect(plan.after.files[retainedPath]).toBeTypeOf('string');
  expect(Object.keys(plan.after.files)).not.toContain(route('undefined'));
  if ('win32' === process.platform) {
    expect(Object.keys(plan.additions)).not.toContain(route('RETAINED'));
    expect(plan.after.files[retainedPath]).toBe(plan.before.files[retainedPath]);
  }
});

it('creates only recorded resources beside preexisting middleware configuration', async () => {
  await uninstall(root);
  const custom = 'schema=1\n# user configuration\nmiddleware=[]\n';
  await actual.writeFile(file('.arch/harness.toml'), custom);
  await setup(root, ['tool']);
  const state = stateFrom(await readFile(file('.arch/bootstrap.json')));
  expect(state.createdHarness).toBe(false);
  expect(await readFile(file('.arch/harness.toml'), 'utf8')).toBe(custom);
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));
  expect(files.sort()).toEqual(
    [...Object.keys(state.files), '.arch/bootstrap.json', '.arch/harness.toml', 'user.txt'].sort(),
  );
  if ('win32' !== process.platform) {
    for (const path of Object.keys(state.files)) {
      expect((await stat(file(path))).mode & 0o111).toBe(path.startsWith('.arch/bin/') ? 0o111 : 0);
    }
  }
});
