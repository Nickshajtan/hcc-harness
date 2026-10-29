import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { setup as m1Setup } from '../fixtures/m1-setup.js';
import {
  inspectInstallation,
  manifestRoutes,
  reconcileRoutes,
  deinitialize,
} from '../../src/lifecycle.js';
import { stateFrom, setup } from '../../src/setup.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it.each([true, false])(
  'captures M1 generator ownership with createdHarness=%s',
  async (created) => {
    await mkdir('.test-state', { recursive: true });
    const root = await mkdtemp(join(tmpdir(), 'arch-m1-'));
    roots.push(root);
    if (!created) {
      await mkdir(join(root, '.arch'));
      await writeFile(join(root, '.arch/harness.toml'), 'schema=1\nmiddleware=[]\n');
    }
    await m1Setup(root, ['Claude', 'my_tool-2']);
    const state = JSON.parse(await readFile(join(root, '.arch/bootstrap.json'), 'utf8'));
    expect(Object.keys(state).sort()).toEqual(['createdHarness', 'files']);
    expect(state.createdHarness).toBe(created);
    expect(Object.keys(state.files)).toHaveLength(process.platform === 'win32' ? 6 : 4);
    for (const [file, hash] of Object.entries(state.files)) {
      expect(
        createHash('sha256')
          .update(await readFile(join(root, file)))
          .digest('hex'),
      ).toBe(hash);
    }
    // Property order and captured old runtime/checkout paths are not migration gates.
    state.files = Object.fromEntries(Object.entries(state.files).reverse());
    await writeFile(join(root, '.arch/bootstrap.json'), JSON.stringify(state));
    // Re-init recognizes old captured renderer paths and JSON order without rewriting.
    const before = await readFile(join(root, '.arch/bootstrap.json'));
    await setup(root, ['my_tool-2', 'Claude']);
    expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(before);
    await writeFile(join(root, '.arch/harness.toml'), 'schema=1\n# user edit\nmiddleware=[]\n');
    expect((await inspectInstallation(root, { PATH: '' })).state).toBe('initialized');
    expect(manifestRoutes(stateFrom(Buffer.from(JSON.stringify(state)))).commands.sort()).toEqual([
      'Claude',
      'my_tool-2',
    ]);
    await reconcileRoutes(root, ['Claude', 'another']);
    expect(await readFile(join(root, '.arch/harness.toml'), 'utf8')).toContain('# user edit');
    await deinitialize(root);
    expect(await readFile(join(root, '.arch/harness.toml'), 'utf8')).toContain('# user edit');
  },
);

it('does not require a generated harness to remain present for route integrity or removal', async () => {
  await mkdir('.test-state', { recursive: true });
  const root = await mkdtemp(join(tmpdir(), 'arch-m1-missing-config-'));
  roots.push(root);
  await m1Setup(root, ['tool']);
  await unlink(join(root, '.arch/harness.toml'));
  expect((await inspectInstallation(root, { PATH: '' })).state).toBe('initialized');
  await reconcileRoutes(root, ['tool', 'another']);
  await deinitialize(root);
  expect((await inspectInstallation(root, { PATH: '' })).state).toBe('uninitialized');
});

it('reads M1 uninstall checkpoints without requiring already-removed resources', async () => {
  await mkdir('.test-state', { recursive: true });
  const root = await mkdtemp(join(tmpdir(), 'arch-m1-recovery-'));
  roots.push(root);
  await m1Setup(root, ['tool']);
  await rename(join(root, '.arch/bootstrap.json'), join(root, '.arch/uninstall.json'));
  await unlink(join(root, '.config/mise/conf.d/arch.toml'));
  expect((await inspectInstallation(root, { PATH: '' })).state).toBe('recovery_pending');
  await deinitialize(root);
  expect((await inspectInstallation(root, { PATH: '' })).state).toBe('uninitialized');
});

it('preserves safe legacy uninstall for parseable manifests without route completeness', async () => {
  await mkdir('.test-state', { recursive: true });
  const root = await mkdtemp(join(tmpdir(), 'arch-m1-incomplete-'));
  roots.push(root);
  await mkdir(join(root, '.arch'));
  await writeFile(join(root, '.arch/bootstrap.json'), '{"files":{},"createdHarness":false}');
  expect((await inspectInstallation(root, { PATH: '' })).state).toBe('invalid_state');
  await deinitialize(root);
  expect((await inspectInstallation(root, { PATH: '' })).state).toBe('uninitialized');
});
