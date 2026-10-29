import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup, stateFrom } from '../../src/setup.js';
import { inspectInstallation, reconcileRoutes } from '../../src/lifecycle.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function project() {
  const root = await mkdtemp(join(tmpdir(), 'arch-lifecycle-contract-'));
  roots.push(root);
  await setup(root, ['first', 'retained']);
  return root;
}
async function snapshot(root: string) {
  const names = await readdir(root, { recursive: true, withFileTypes: true });
  return Object.fromEntries(
    await Promise.all(
      names
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const path = join(entry.parentPath, entry.name);
          return [path, (await readFile(path)).toString('base64')] as const;
        }),
    ),
  );
}
const route = (name: string) => `.arch/bin/${name}${'win32' === process.platform ? '.exe' : ''}`;

it('records the complete checkpoint sequence and preserves retained bytes', async () => {
  const root = await project();
  const retained = await readFile(join(root, route('retained')));
  const phases: string[] = [];
  await reconcileRoutes(root, ['retained', 'added'], {
    checkpoint(phase) {
      phases.push(phase);
    },
  });
  const additions =
    'win32' === process.platform ? [route('added'), '.arch/bin/added.shim'] : [route('added')];
  const removals =
    'win32' === process.platform ? [route('first'), '.arch/bin/first.shim'] : [route('first')];
  expect(phases).toEqual([
    'journal',
    ...additions.flatMap((path) => [`staged:${path}`, `published:${path}`]),
    ...removals.map((path) => `removed:${path}`),
    'before-manifest',
    'manifest',
    'cleanup',
  ]);
  expect(await readFile(join(root, route('retained')))).toEqual(retained);
  expect((await readdir(join(root, '.arch'))).filter((name) => name.includes('routing'))).toEqual(
    [],
  );
  const before = await snapshot(root);
  await reconcileRoutes(root, ['retained', 'added'], {
    checkpoint() {
      throw new Error('unchanged update must not checkpoint');
    },
  });
  expect(await snapshot(root)).toEqual(before);
});

it('keeps inspection read-only for invalid middleware and orphan staging', async () => {
  const root = await project();
  await writeFile(join(root, '.arch/harness.toml'), 'invalid = [');
  await writeFile(join(root, '.arch/routing.stage'), 'unowned stage');
  const before = await snapshot(root);
  const status = await inspectInstallation(root, { PATH: '' });
  expect(status.state).toBe('initialized');
  expect(status.integrity).toBe('valid');
  expect(status.warnings).toContain(
    'Unreferenced .arch/routing.stage; inspect and move it before another routing update.',
  );
  expect(status.warnings).toContain(
    'Middleware configuration is invalid; restore valid .arch/harness.toml before execution. Routing ownership is reported independently.',
  );
  expect(await snapshot(root)).toEqual(before);
  await expect(reconcileRoutes(root, ['added'])).rejects.toThrow('Unreferenced staging file');
  expect(await snapshot(root)).toEqual(before);
});

it('refuses recovery when retained ownership changes without touching unrelated files', async () => {
  const root = await project();
  await expect(
    reconcileRoutes(root, ['retained', 'added'], {
      checkpoint() {
        throw new Error('stop');
      },
    }),
  ).rejects.toThrow('stop');
  const journal = await readFile(join(root, '.arch/routing.json'));
  await writeFile(join(root, route('retained')), 'user changes');
  await writeFile(join(root, 'user.txt'), 'keep');
  const before = await snapshot(root);
  await expect(reconcileRoutes(root, ['retained', 'added'])).rejects.toThrow(
    'Managed file changed during routing recovery',
  );
  expect((await inspectInstallation(root, { PATH: '' })).state).toBe('invalid_state');
  expect(await snapshot(root)).toEqual(before);
  expect(await readFile(join(root, '.arch/routing.json'))).toEqual(journal);
});

it('accepts historical metadata and reordered ownership without rewriting status', async () => {
  const root = await project();
  const path = join(root, '.arch/bootstrap.json');
  const state = stateFrom(await readFile(path));
  await writeFile(
    path,
    JSON.stringify({
      historical: { runtime: '/removed/node', checkout: '/moved/arch' },
      createdHarness: state.createdHarness,
      files: Object.fromEntries(Object.entries(state.files).reverse()),
    }),
  );
  const before = await snapshot(root);
  expect((await inspectInstallation(root, { PATH: '' })).state).toBe('initialized');
  await setup(root, ['retained', 'first']);
  expect(await snapshot(root)).toEqual(before);
});
