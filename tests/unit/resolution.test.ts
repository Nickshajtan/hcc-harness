import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, chmod, rm, symlink } from 'node:fs/promises';
import { resolve, join, delimiter } from 'node:path';
import { nativeEnvironment, resolveExecutable, routerMarker } from '../../src/process.js';

let root: string;
const command = process.platform === 'win32' ? 'tool.exe' : 'tool';
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
it.skipIf(process.platform === 'win32')(
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
