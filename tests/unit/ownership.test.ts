import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFiles, readOptional, assertSafePath } from '../../src/lifecycle/ownership.js';
import {
  digest,
  encode,
  statePath,
  uninstallPath,
  routePath,
  markerPath,
} from '../../src/lifecycle/manifest.js';
import { validateRecovery } from '../../src/lifecycle/recovery-validation.js';
import { staging } from '../../src/lifecycle/routing-files.js';
import { journalStage, type RoutingJournal } from '../../src/lifecycle/routing-journal.js';

let root: string;
let journal: RoutingJournal;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'arch-ownership-'));
  await mkdir(join(root, '.arch/bin'), { recursive: true });
  await mkdir(join(root, '.config/mise/conf.d'), { recursive: true });
  const files = {
    [routePath]: digest('mise'),
    [markerPath]: digest('marker'),
    '.arch/bin/retained': digest('retained'),
    '.arch/bin/removed': digest('removed'),
  };
  journal = {
    schema: 1,
    id: '12345678-1234-1234-1234-123456789abc',
    before: { files, createdHarness: false },
    after: {
      files: {
        [routePath]: files[routePath],
        [markerPath]: files[markerPath],
        '.arch/bin/retained': digest('retained'),
        '.arch/bin/added': digest('added'),
      },
      createdHarness: false,
    },
    additions: { '.arch/bin/added': Buffer.from('added').toString('base64') },
  };
  await Promise.all(
    [
      [routePath, 'mise'],
      [markerPath, 'marker'],
      ['.arch/bin/retained', 'retained'],
      ['.arch/bin/removed', 'removed'],
      [statePath, encode(journal.before)],
    ].map(async ([path, value]) => {
      if (undefined === path || undefined === value) {
        throw new Error('Invalid fixture');
      }
      await writeFile(join(root, path), value);
    }),
  );
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('proves recorded bytes, not template/runtime reachability, and never mutates them', async () => {
  const path = '.arch/bin/retained';
  const historical = '#!/removed/node /moved/checkout/cli.js';
  await writeFile(join(root, path), historical);
  await checkFiles(root, { [path]: digest(historical) });
  expect(await readFile(join(root, path), 'utf8')).toBe(historical);
  await expect(checkFiles(root, { [path]: digest('today renderer') })).rejects.toThrow(
    `Managed file changed; refusing to overwrite/remove: ${path}`,
  );
  expect(await readFile(join(root, path), 'utf8')).toBe(historical);
});
it('allows missing files only when explicitly checking an uninstall checkpoint', async () => {
  await unlink(join(root, '.arch/bin/removed'));
  await expect(checkFiles(root, journal.before.files)).rejects.toThrow('Managed file changed');
  await checkFiles(root, journal.before.files, true);
  await writeFile(join(root, '.arch/bin/retained'), 'modified');
  await expect(checkFiles(root, journal.before.files, true)).rejects.toThrow(
    'Managed file changed',
  );
});
it('distinguishes absence from read errors and rejects symlinked managed files', async () => {
  expect(await readOptional(join(root, 'absent'))).toBeUndefined();
  await expect(readOptional(join(root, 'absent/../.arch/bin'))).rejects.toThrow();
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'owned'), 'user data');
  await symlink(
    outside,
    join(root, '.arch/linked'),
    'win32' === process.platform ? 'junction' : 'dir',
  );
  await expect(assertSafePath(root, '.arch/linked/owned')).rejects.toThrow(
    'Refusing managed symlink',
  );
  expect(await readFile(join(outside, 'owned'), 'utf8')).toBe('user data');
});
it('accepts only before/after bootstrap ownership and legitimate absent additions/removals', async () => {
  await validateRecovery(root, journal);
  await unlink(join(root, '.arch/bin/removed'));
  await validateRecovery(root, journal);
  await writeFile(join(root, statePath), encode(journal.after));
  await validateRecovery(root, journal);
  await writeFile(join(root, '.arch/bin/added'), 'added');
  await validateRecovery(root, journal);
  await writeFile(join(root, statePath), encode({ ...journal.before, createdHarness: true }));
  await expect(validateRecovery(root, journal)).rejects.toThrow(
    'Bootstrap changed during routing recovery',
  );
});
it.each(['retained', 'added', 'removed'])('refuses modified recovery resource %s', async (name) => {
  await writeFile(join(root, `.arch/bin/${name}`), 'user data');
  await expect(validateRecovery(root, journal)).rejects.toThrow(
    `Managed file changed during routing recovery: .arch/bin/${name}`,
  );
  expect(await readFile(join(root, `.arch/bin/${name}`), 'utf8')).toBe('user data');
});
it('requires retained resources and bootstrap even when a recovery journal exists', async () => {
  await unlink(join(root, '.arch/bin/retained'));
  await expect(validateRecovery(root, journal)).rejects.toThrow(
    'Managed file changed during routing recovery',
  );
  await unlink(join(root, statePath));
  await expect(validateRecovery(root, journal)).rejects.toThrow(
    'Missing bootstrap during routing recovery',
  );
});
it('refuses conflicting operation journals before inspecting bootstrap', async () => {
  await unlink(join(root, statePath));
  await writeFile(join(root, uninstallPath), 'unrelated bytes');
  await expect(validateRecovery(root, journal)).rejects.toThrow(
    'Conflicting routing and uninstall journals',
  );
  expect(await readFile(join(root, uninstallPath), 'utf8')).toBe('unrelated bytes');
});
it.each([journalStage, 'addition', 'manifest'])(
  'protects incomplete private staging at %s',
  async (kind) => {
    const paths = { addition: staging(journal, 0), manifest: staging(journal, 'manifest') };
    const path = 'addition' === kind || 'manifest' === kind ? paths[kind] : kind;
    await writeFile(join(root, path), 'partial');
    await expect(validateRecovery(root, journal)).rejects.toThrow(
      `Routing staging file changed or incomplete: ${path}`,
    );
    expect(await readFile(join(root, path), 'utf8')).toBe('partial');
  },
);
it('validates all complete stages without deleting any evidence', async () => {
  const stages = {
    [journalStage]: JSON.stringify(journal, null, 2) + '\n',
    [staging(journal, 0)]: 'added',
    [staging(journal, 'manifest')]: encode(journal.after),
  };
  for (const [path, bytes] of Object.entries(stages)) {
    await writeFile(join(root, path), bytes);
  }
  await validateRecovery(root, journal);
  await validateRecovery(root, journal);
  for (const [path, bytes] of Object.entries(stages)) {
    expect(await readFile(join(root, path), 'utf8')).toBe(bytes);
  }
});
