import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, chmod, rm, symlink, realpath } from 'node:fs/promises';
import { resolve, join, delimiter } from 'node:path';
import { nativeEnvironment, resolveExecutable, routerMarker } from '../../src/process.js';

let root: string;
const command = 'win32' === process.platform ? 'tool.exe' : 'tool';
beforeEach(async () => {
  await mkdir('.test-state', { recursive: true });
  root = await mkdtemp(resolve('.test-state/resolution-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function candidate(directory: string) {
  await mkdir(directory, { recursive: true });
  const file = join(directory, command);
  await writeFile(file, 'fixture');
  await chmod(file, 0o755);
  return file;
}
it.each(['command-wrappers/bin', 'mise/shims'])(
  'accepts legitimate directory named %s',
  async (name) => {
    const directory = join(root, name),
      file = await candidate(directory);
    await expect(resolveExecutable('tool', root, { PATH: directory })).resolves.toBe(file);
  },
);
it('preserves precedence, relative entries, and ignores nonexistent directories', async () => {
  const first = join(root, 'first'),
    second = join(root, 'second');
  const file = await candidate(first);
  await candidate(second);
  await expect(
    resolveExecutable('tool', root, { PATH: ['missing', 'first', second].join(delimiter) }),
  ).resolves.toBe(file);
  await expect(resolveExecutable('absent', root, { PATH: second })).rejects.toThrow(
    'Native executable not found',
  );
});
it('skips marked Arch wrappers and preserves all other PATH entries in order', async () => {
  const own = join(root, 'own'),
    native = join(root, 'native');
  await candidate(own);
  const file = await candidate(native);
  await writeFile(join(own, '.arch-router'), routerMarker);
  const env = { PATH: [own, 'missing', native].join(delimiter), KEEP: 'kept' };
  const cleaned = await nativeEnvironment(env, root);
  expect(cleaned).toEqual({ PATH: ['missing', native].join(delimiter), KEEP: 'kept' });
  expect(env.PATH).toContain(own);
  await expect(resolveExecutable('tool', root, env)).resolves.toBe(file);
});
it('does not exclude an unrelated directory with a different marker', async () => {
  const directory = join(root, 'other');
  const file = await candidate(directory);
  await writeFile(join(directory, '.arch-router'), 'unrelated');
  await expect(resolveExecutable('tool', root, { PATH: directory })).resolves.toBe(file);
});
it.skipIf('win32' === process.platform)(
  'skips a symlink to a marked wrapper by real executable identity',
  async () => {
    const own = join(root, 'own'),
      alias = join(root, 'alias'),
      native = join(root, 'native');
    const wrapper = await candidate(own);
    await mkdir(alias);
    await writeFile(join(own, '.arch-router'), routerMarker);
    await symlink(wrapper, join(alias, command));
    const file = await candidate(native);
    await expect(
      resolveExecutable('tool', root, { PATH: [alias, native].join(delimiter) }),
    ).resolves.toBe(file);
  },
);

it.each(['../tool', '/tool', 'a/b', 'a\\b', '', '-tool', 'tool name', 'tool;echo'])(
  'rejects executable path or invalid name %j before lookup',
  async (name) => {
    await expect(resolveExecutable(name, root, {})).rejects.toThrow(
      'Expected an executable name without paths',
    );
  },
);

it('does not interpret empty PATH entries as the working directory', async () => {
  await candidate(root);
  for (const PATH of ['', delimiter, delimiter + delimiter]) {
    await expect(resolveExecutable('tool', root, { PATH })).rejects.toThrow(
      'Native executable not found: tool',
    );
  }
});

it('skips directory candidates without losing later PATH candidates', async () => {
  const directory = join(root, 'directory');
  await mkdir(join(directory, command), { recursive: true });
  const file = await candidate(join(root, 'native'));
  await expect(
    resolveExecutable('tool', root, {
      PATH: [directory, join(root, 'native')].join(delimiter),
    }),
  ).resolves.toBe(file);
});

it('retains mixed-case PATH keys and exact non-router relative entries without mutating input', async () => {
  const env = Object.freeze({ Path: ['', '.', 'missing', ''].join(delimiter), EMPTY: '' });
  const filtered = await nativeEnvironment(env, root);
  expect(filtered).toEqual({ Path: ['.', 'missing'].join(delimiter), EMPTY: '' });
  expect(filtered).not.toBe(env);
  expect(await nativeEnvironment({ EMPTY: '' }, root)).toEqual({ EMPTY: '', PATH: '' });
});

it('propagates unexpected marker-read failures without silently selecting another executable', async () => {
  const directory = join(root, 'broken');
  await candidate(directory);
  await mkdir(join(directory, '.arch-router'));
  await expect(nativeEnvironment({ PATH: directory }, root)).rejects.toThrow();
  await expect(resolveExecutable('tool', root, { PATH: directory })).rejects.toThrow();
});

it.skipIf('win32' === process.platform)(
  'skips non-executable files and resolves native symlink identity',
  async () => {
    const denied = join(root, 'denied');
    await chmod(await candidate(denied), 0o644);
    const file = await candidate(join(root, 'native'));
    const alias = join(root, 'alias');
    await mkdir(alias);
    await symlink(file, join(alias, command));
    await expect(
      resolveExecutable('tool', root, { PATH: [denied, alias].join(delimiter) }),
    ).resolves.toBe(await realpath(file));
  },
);

it.skipIf('win32' !== process.platform)(
  'honors PATHEXT order, case-insensitive keys and explicit extensions',
  async () => {
    await writeFile(join(root, 'tool.cmd'), 'fixture');
    const exe = await candidate(root);
    await expect(
      resolveExecutable('tool', root, { Path: root, PathExt: '.IGNORED;.CMD;.EXE' }),
    ).resolves.toBe(join(root, 'tool.cmd'));
    await expect(
      resolveExecutable('tool', root, { Path: root, PathExt: '.EXE;.CMD' }),
    ).resolves.toBe(exe);
    await expect(resolveExecutable('tool.cmd', root, { PATH: root, PATHEXT: '' })).resolves.toBe(
      join(root, 'tool.cmd'),
    );
    await expect(resolveExecutable('tool', root, { PATH: root, PATHEXT: '' })).rejects.toThrow(
      'Native executable not found: tool',
    );
  },
);
