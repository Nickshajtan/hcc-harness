import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  unlink,
  rename,
  link,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { setup, stateFrom, validateCommands, digest } from '../../src/setup.js';
import {
  addRoutes,
  removeRoutes,
  planRoutes,
  reconcileRoutes,
  inspectInstallation,
  deinitialize,
  manifestRoutes,
} from '../../src/lifecycle.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, link: vi.fn(actual.link), rename: vi.fn(actual.rename) };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
let root: string;
const route = (command: string) =>
  `.arch/bin/${command}${'win32' === process.platform ? '.exe' : ''}`;
const stateFile = () => join(root, '.arch/bootstrap.json');
beforeEach(async () => {
  vi.mocked(link).mockImplementation(actual.link);
  vi.mocked(rename).mockImplementation(actual.rename);
  await mkdir('.test-state', { recursive: true });
  root = await mkdtemp(join(tmpdir(), 'arch-lifecycle-'));
  await setup(root, ['tool', 'other']);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it.each(
  [[], ['node'], ['mise'], ['ARCH'], ['../tool'], ['x.y'], ['a', 'a']].map((commands) => ({
    commands,
  })),
)('rejects invalid route set $commands', ({ commands }) => {
  expect(() => {
    validateCommands(commands);
  }).toThrow();
});
it('uses Windows case identity without changing POSIX validation', () => {
  if ('win32' === process.platform) {
    expect(() => {
      validateCommands(['tool', 'TOOL']);
    }).toThrow();
  } else {
    expect(() => {
      validateCommands(['tool', 'TOOL']);
    }).not.toThrow();
  }
});
it('plans only additions/removals and preserves recorded bytes and middleware ownership', async () => {
  const state = stateFrom(await readFile(stateFile()));
  await writeFile(join(root, '.arch/harness.toml'), 'user-edited content');
  const plan = await planRoutes(root, ['tool', 'newtool']);
  expect(plan.after.createdHarness).toBe(state.createdHarness);
  expect(plan.after.files[route('tool')]).toBe(state.files[route('tool')]);
  expect(Object.keys(plan.additions)).toContain(route('newtool'));
  expect(plan.removed).toContain(route('other'));
  await reconcileRoutes(root, ['tool', 'newtool']);
  expect((await inspectInstallation(root)).routes).toEqual(['tool', 'newtool']);
  expect(await readFile(join(root, '.arch/harness.toml'), 'utf8')).toBe('user-edited content');
});
it('adds/removes idempotently and refuses the final route', async () => {
  await addRoutes(root, ['newtool']);
  await addRoutes(root, ['newtool']);
  await removeRoutes(root, ['other', 'newtool']);
  await removeRoutes(root, ['missing']);
  const before = await readFile(stateFile());
  await reconcileRoutes(root, ['tool']);
  expect(await readFile(stateFile())).toEqual(before);
  await expect(removeRoutes(root, ['tool'])).rejects.toThrow('final route');
});
it('refuses modified/missing owned files and empty-file collisions before journaling', async () => {
  const owned = join(root, route('tool')),
    old = await readFile(owned);
  await writeFile(owned, 'user data');
  await expect(addRoutes(root, ['newtool'])).rejects.toThrow();
  await unlink(owned);
  await expect(addRoutes(root, ['newtool'])).rejects.toThrow();
  await writeFile(owned, old);
  await writeFile(join(root, route('newtool')), '');
  await expect(addRoutes(root, ['newtool'])).rejects.toThrow('Refusing to overwrite');
  await expect(readFile(join(root, '.arch/routing.json'))).rejects.toThrow();
});
it('rejects a file that appears at exclusive publication without overwriting it', async () => {
  vi.mocked(link).mockImplementation(async (source, destination) => {
    if (destination.toString() === join(root, route('newtool'))) {
      await writeFile(destination, 'racing owner');
    }
    await actual.link(source, destination);
  });
  await expect(reconcileRoutes(root, ['tool', 'newtool'])).rejects.toThrow();
  expect(await readFile(join(root, route('newtool')), 'utf8')).toBe('racing owner');
  expect((await inspectInstallation(root)).state).toBe('invalid_state');
  await expect(deinitialize(root)).rejects.toThrow('Managed file changed');
  expect(await readFile(join(root, route('other')))).toBeDefined();
});
it.each(['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EPERM'])(
  'fails safely without fallback when hard-link publication returns %s',
  async (code) => {
    const before = await readFile(stateFile());
    const owned = stateFrom(before);
    const originals = await Promise.all(
      Object.keys(owned.files).map((path) => readFile(join(root, path))),
    );
    await writeFile(join(root, 'unrelated.txt'), 'keep');
    vi.mocked(link).mockRejectedValue(Object.assign(new Error('hard links unsupported'), { code }));
    await expect(reconcileRoutes(root, ['newtool'])).rejects.toThrow(
      `exclusively (${code}). Routing reconciliation requires hard-link support; exFAT`,
    );
    expect(link).toHaveBeenCalledTimes(1);
    expect(rename).not.toHaveBeenCalled();
    expect(await readFile(stateFile())).toEqual(before);
    expect(
      await Promise.all(Object.keys(owned.files).map((path) => readFile(join(root, path)))),
    ).toEqual(originals);
    expect(await readFile(join(root, 'unrelated.txt'), 'utf8')).toBe('keep');
    expect((await inspectInstallation(root)).state).toBe('initialized');
    expect(await readFile(join(root, route('tool')))).toBeDefined();
    await expect(readFile(join(root, route('newtool')))).rejects.toThrow();
    await expect(readFile(join(root, '.arch/routing.json'))).rejects.toThrow();
    expect(await readFile(join(root, '.arch/routing.stage'))).toBeDefined();
    // M1 removal needs no link when no routing journal has been published.
    await deinitialize(root);
    expect(await readFile(join(root, 'unrelated.txt'), 'utf8')).toBe('keep');
  },
);

it('initializes and deinitializes without calling hard-link publication', async () => {
  vi.mocked(link).mockRejectedValue(new Error('unsupported'));
  await deinitialize(root);
  await setup(root, ['tool']);
  await deinitialize(root);
  expect(link).not.toHaveBeenCalled();
});

it('preserves recovery evidence and all old routes when capability fails after journal publication', async () => {
  const before = await readFile(stateFile());
  vi.mocked(link).mockImplementation(async (source, destination) => {
    if (destination.toString() !== join(root, '.arch/routing.json')) {
      throw Object.assign(new Error('unsupported'), { code: 'ENOTSUP' });
    }
    await actual.link(source, destination);
  });
  await expect(reconcileRoutes(root, ['newtool'])).rejects.toThrow('No fallback was attempted');
  expect(await readFile(stateFile())).toEqual(before);
  expect(await readFile(join(root, route('tool')))).toBeDefined();
  expect(await readFile(join(root, route('other')))).toBeDefined();
  expect((await inspectInstallation(root)).state).toBe('recovery_pending');
  const journal = await readFile(join(root, '.arch/routing.json'));
  await expect(deinitialize(root)).rejects.toThrow('hard-link support');
  expect(await readFile(join(root, '.arch/routing.json'))).toEqual(journal);
  vi.mocked(link).mockImplementation(actual.link);
  await reconcileRoutes(root, ['newtool']);
  expect((await inspectInstallation(root)).routes).toEqual(['newtool']);
});
it('retains the journal on manifest replacement failure and retries without unlinking bootstrap', async () => {
  const old = await readFile(stateFile());
  vi.mocked(rename).mockRejectedValue(
    Object.assign(new Error('sharing violation'), { code: 'EPERM' }),
  );
  await expect(reconcileRoutes(root, ['tool', 'newtool'])).rejects.toThrow('sharing violation');
  expect(await readFile(stateFile())).toEqual(old);
  expect((await inspectInstallation(root)).state).toBe('recovery_pending');
  vi.mocked(rename).mockImplementation(actual.rename);
  await reconcileRoutes(root, ['tool', 'newtool']);
  expect((await inspectInstallation(root)).state).toBe('initialized');
});
it.each(['journal', 'before-manifest', 'manifest', 'cleanup'])(
  'recovers checkpoint %s and refuses a different desired set',
  async (phase) => {
    await expect(
      reconcileRoutes(root, ['tool', 'newtool'], {
        checkpoint(point) {
          if (point === phase) {
            throw new Error('interrupted');
          }
        },
      }),
    ).rejects.toThrow('interrupted');
    expect((await inspectInstallation(root)).state).toBe('recovery_pending');
    await expect(setup(root, ['newtool'])).rejects.toThrow('recovery');
    await expect(reconcileRoutes(root, ['different'])).rejects.toThrow('Routing recovery');
    await reconcileRoutes(root, ['tool', 'newtool']);
    expect((await inspectInstallation(root)).state).toBe('initialized');
  },
);
it('preserves a partial staging write and identifies it instead of deleting ambiguous bytes', async () => {
  await expect(
    reconcileRoutes(root, ['tool', 'newtool'], {
      checkpoint(point) {
        if ('journal' === point) {
          throw new Error('interrupted');
        }
      },
    }),
  ).rejects.toThrow();
  const journal = JSON.parse(await readFile(join(root, '.arch/routing.json'), 'utf8'));
  const stage = join(root, `.arch/.routing-${journal.id}-0.stage`);
  await writeFile(stage, 'partial');
  await expect(reconcileRoutes(root, ['tool', 'newtool'])).rejects.toThrow(
    'staging file changed or incomplete',
  );
  expect(await readFile(stage, 'utf8')).toBe('partial');
  await writeFile(stage, Buffer.from(Object.values(journal.additions)[0] as string, 'base64'));
  await reconcileRoutes(root, ['tool', 'newtool']);
});
it('rejects malformed/conflicting journals, paths, pairs and payload hashes', async () => {
  const state = stateFrom(await readFile(stateFile()));
  expect(() =>
    stateFrom(
      Buffer.from('{"createdHarness":true,"files":{"../secret":"' + 'a'.repeat(64) + '"}}'),
    ),
  ).toThrow();
  const missing = { ...state, files: { ...state.files } };
  delete missing.files['.arch/bin/.arch-router'];
  expect(() => manifestRoutes(missing)).toThrow('Incomplete');
  if ('win32' === process.platform) {
    const pair = { ...state, files: { ...state.files } };
    delete pair.files['.arch/bin/tool.shim'];
    expect(() => manifestRoutes(pair)).toThrow('pair');
  }
  await writeFile(join(root, '.arch/uninstall.json'), JSON.stringify(state));
  expect((await inspectInstallation(root)).state).toBe('invalid_state');
  await expect(deinitialize(root)).rejects.toThrow('Conflicting');
  await unlink(join(root, '.arch/uninstall.json'));
  await expect(
    reconcileRoutes(root, ['newtool'], {
      checkpoint() {
        throw new Error('stop');
      },
    }),
  ).rejects.toThrow();
  const journalPath = join(root, '.arch/routing.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  journal.additions[route('newtool')] = Buffer.from('tampered').toString('base64');
  await writeFile(journalPath, JSON.stringify(journal));
  expect((await inspectInstallation(root)).state).toBe('invalid_state');
});
it('reports installation separately from activation and status never writes', async () => {
  const before = await readFile(stateFile());
  const absent = await inspectInstallation(root, { PATH: '' });
  expect(absent).toMatchObject({
    schema: 1,
    state: 'initialized',
    integrity: 'valid',
    activation: { miseAvailable: false, projectBinOnPath: false, shellActivation: 'unknown' },
  });
  const onPath = await inspectInstallation(root, { PATH: join(root, '.arch/bin') });
  expect(onPath.activation).toMatchObject({ projectBinOnPath: true, shellActivation: 'unknown' });
  expect(JSON.parse(JSON.stringify(onPath))).toEqual(onPath);
  expect(await readFile(stateFile())).toEqual(before);
  await deinitialize(root);
  expect((await inspectInstallation(root, { PATH: '' })).state).toBe('uninitialized');
});
it('never follows symlinked managed parents to another project', async () => {
  const target = join(root, 'outside');
  await mkdir(target);
  await writeFile(join(target, 'bootstrap.json'), 'user data');
  const project = join(root, 'symlink-project');
  await mkdir(project);
  await symlink(target, join(project, '.arch'), 'win32' === process.platform ? 'junction' : 'dir');
  await expect(setup(project, ['tool'])).rejects.toThrow('symlink');
  expect((await inspectInstallation(project)).state).toBe('invalid_state');
  await expect(deinitialize(project)).rejects.toThrow('symlink');
  expect(await readFile(join(target, 'bootstrap.json'), 'utf8')).toBe('user data');
});
it('keeps native files and unrelated project content through updates/deinit/reinit', async () => {
  const native = join(root, 'native');
  await writeFile(native, 'native executable');
  const hash = digest(await readFile(native));
  await writeFile(join(root, '.arch/notes'), 'notes');
  await reconcileRoutes(root, ['newtool']);
  await deinitialize(root);
  await setup(root, ['tool']);
  expect(digest(await readFile(native))).toBe(hash);
  expect(await readFile(join(root, '.arch/notes'), 'utf8')).toBe('notes');
});
