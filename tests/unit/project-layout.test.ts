import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { configurationDirectories, discoverConfiguration } from '../../src/config.js';
import { projectLayout, resolveProjectLayout } from '../../src/project-layout.js';
import { setup, configText, digest } from '../../src/setup.js';
import {
  addRoutes,
  removeRoutes,
  reconcileRoutes,
  inspectInstallation,
  deinitialize,
} from '../../src/lifecycle.js';
import { stateFrom } from '../../src/lifecycle/manifest.js';
import { nativeEnvironment, routerMarker } from '../../src/process.js';
import { parseManagement } from '../../src/cli/parsing.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hcc-layout-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it.each(configurationDirectories)('keeps the complete lifecycle in %s', async (directory) => {
  const layout = projectLayout(root, directory);
  await setup(root, ['tool'], directory);
  await setup(root, ['tool']);
  expect(await resolveProjectLayout(root)).toEqual(layout);
  expect((await discoverConfiguration(root))?.configurationDirectory).toBe(
    layout.configurationDirectory,
  );
  const manifest = stateFrom(await readFile(join(root, layout.statePath)), layout);
  expect(
    Object.keys(manifest.files).every(
      (path) => path.startsWith(`${directory}/bin/`) || '.config/mise/conf.d/arch.toml' === path,
    ),
  ).toBe(true);
  expect(await readFile(join(root, '.config/mise/conf.d/arch.toml'), 'utf8')).toContain(
    `{{config_root}}/${directory}/bin`,
  );
  const nested = join(root, 'src/nested');
  await mkdir(nested, { recursive: true });
  expect((await resolveProjectLayout(nested)).projectRoot).toBe(root);
  await addRoutes(root, ['second']);
  await removeRoutes(root, ['tool']);
  await reconcileRoutes(root, ['third']);
  expect((await inspectInstallation(root)).routes).toEqual(['third']);
  await mkdir(join(layout.configurationDirectory, 'modules/policy'), { recursive: true });
  await writeFile(join(layout.configurationDirectory, 'modules/policy/index.mjs'), 'user source');
  await writeFile(join(root, layout.configurationPath), configText + '# user edit\n');
  const env = await nativeEnvironment(
    { PATH: [join(root, layout.binDirectory), root].join(delimiter) },
    root,
  );
  expect(env.PATH).toBe(root);
  await deinitialize(root);
  await deinitialize(root);
  expect(await readFile(join(root, layout.configurationPath), 'utf8')).toBe(
    configText + '# user edit\n',
  );
  expect(
    await readFile(join(layout.configurationDirectory, 'modules/policy/index.mjs'), 'utf8'),
  ).toBe('user source');
  expect(await readdir(join(root, layout.binDirectory))).toEqual([]);
  if ('.arch' !== directory) {
    expect(await readdir(root)).not.toContain('.arch');
  }
});

it.each(configurationDirectories)(
  'recovers interrupted routes and removal under %s without configuration',
  async (directory) => {
    const layout = projectLayout(root, directory);
    await setup(root, ['tool'], directory);
    await expect(
      reconcileRoutes(root, ['second'], {
        checkpoint: (phase) => {
          if ('manifest' === phase) {
            throw new Error('interrupted');
          }
        },
      }),
    ).rejects.toThrow('interrupted');
    await unlink(join(root, layout.configurationPath));
    expect((await inspectInstallation(root)).state).toBe('recovery_pending');
    await reconcileRoutes(root, ['second']);
    expect((await inspectInstallation(root)).routes).toEqual(['second']);
    // Simulate a committed uninstall checkpoint with one deletion completed.
    const bytes = await readFile(join(root, layout.statePath));
    const state = stateFrom(bytes, layout);
    await writeFile(join(root, layout.uninstallPath), bytes);
    await unlink(join(root, layout.statePath));
    const path = Object.keys(state.files).find((path) => path.startsWith(`${directory}/bin/`));
    expect(path).toBeDefined();
    await unlink(join(root, path!));
    await deinitialize(root);
    expect((await inspectInstallation(root)).state).toBe('uninitialized');
    if ('.arch' !== directory) {
      expect(await readdir(root)).not.toContain('.arch');
    }
  },
);

it.each(configurationDirectories)(
  'blocks modified, malformed and claimed ownership under %s',
  async (directory) => {
    const layout = projectLayout(root, directory);
    await setup(root, ['tool'], directory);
    await mkdir(join(root, layout.setupClaimPath));
    await expect(deinitialize(root)).rejects.toThrow('Unresolved setup claim');
    expect((await inspectInstallation(root)).state).toBe('invalid_state');
    await rmdir(join(root, layout.setupClaimPath));
    const original = await readFile(join(root, layout.markerPath));
    await writeFile(join(root, layout.markerPath), 'foreign');
    await expect(deinitialize(root)).rejects.toThrow('Managed file changed');
    await writeFile(join(root, layout.markerPath), original);
    const manifest = await readFile(join(root, layout.statePath));
    await writeFile(
      join(root, layout.statePath),
      JSON.stringify({
        files: { '.arch/bin/foreign': digest(routerMarker) },
        createdHarness: true,
      }),
    );
    if ('.arch' !== directory) {
      await expect(deinitialize(root)).rejects.toThrow('Invalid bootstrap');
    }
    await writeFile(join(root, layout.statePath), manifest);
    await writeFile(join(layout.configurationDirectory, 'unknown.txt'), 'retain');
    await deinitialize(root);
    expect(await readFile(join(layout.configurationDirectory, 'unknown.txt'), 'utf8')).toBe(
      'retain',
    );
  },
);

it('refuses a split legacy installation instead of migrating or deleting either home', async () => {
  await setup(root, ['tool']);
  await mkdir(join(root, '.ai/arch'), { recursive: true });
  await writeFile(join(root, '.ai/arch/harness.toml'), configText);
  await expect(setup(root, ['tool'])).rejects.toThrow('Conflicting HCC');
  await expect(deinitialize(root)).rejects.toThrow('Conflicting HCC');
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toBeDefined();
});

it('rejects explicit migration and unsupported selectors before creating resources', async () => {
  await setup(root, ['tool'], '.hcc');
  await expect(setup(root, ['tool'], '.ai/arch')).rejects.toThrow('no implicit migration');
  expect(() => parseManagement(['init', 'tool', '--config-dir', '.other'], false)).toThrow();
  expect(parseManagement(['init', 'tool', '--config-dir', '.ai/arch'], false)).toEqual({
    operation: 'init',
    commands: ['tool'],
    configurationDirectory: '.ai/arch',
  });
  expect(await readdir(root)).not.toContain('.arch');
});

it('does not classify an unmarked alias directory as a managed launcher directory', async () => {
  await mkdir(join(root, '.hcc/bin'), { recursive: true });
  const path = join(root, '.hcc/bin');
  expect((await nativeEnvironment({ PATH: path }, root)).PATH).toBe(path);
});

it('filters a marked home through a realpath alias/junction', async () => {
  await setup(root, ['tool'], '.ai/arch');
  const alias = join(root, 'alias');
  await symlink(
    join(root, '.ai/arch/bin'),
    alias,
    'win32' === process.platform ? 'junction' : 'dir',
  );
  expect((await nativeEnvironment({ PATH: alias }, root)).PATH).toBe('');
});

it.each(configurationDirectories)(
  'refuses symlinked bootstrap and removal authority in %s',
  async (directory) => {
    const layout = projectLayout(root, directory);
    await setup(root, ['tool'], directory);
    const foreign = join(root, 'foreign-authority');
    await mkdir(foreign);
    const saved = join(foreign, 'manifest.json');
    await rename(join(root, layout.statePath), saved);
    const original = await readFile(saved);
    for (const path of [layout.statePath, layout.uninstallPath]) {
      await symlink(
        'win32' === process.platform ? foreign : saved,
        join(root, path),
        'win32' === process.platform ? 'junction' : 'file',
      );
      await expect(deinitialize(root)).rejects.toThrow('Refusing managed symlink');
      expect(await readFile(saved)).toEqual(original);
      expect(await readFile(join(root, layout.markerPath), 'utf8')).toBe(routerMarker);
      await unlink(join(root, path));
    }
  },
);
