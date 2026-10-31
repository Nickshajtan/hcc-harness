import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { confirmRemoval, setupWizard, type Interaction } from '../../src/wizard.js';
import { inspectInstallation, reconcileRoutes } from '../../src/lifecycle.js';
import { stateFrom } from '../../src/lifecycle/manifest.js';
import { discoverClis } from '../../src/discovery.js';
import { setup } from '../../src/setup.js';

vi.mock('../../src/discovery.js', async (original) => ({
  ...(await original<typeof import('../../src/discovery.js')>()),
  discoverClis: vi.fn(() => Promise.resolve([])),
}));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'arch-wizard-'));
  vi.mocked(discoverClis).mockResolvedValue([]);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
function interaction(answers: (string | null)[]) {
  const output: string[] = [];
  const ui: Interaction = {
    ask(message) {
      output.push(message);
      return Promise.resolve(answers.shift() ?? null);
    },
    write(message) {
      output.push(message);
    },
  };
  return { ui, output };
}
it.each([['cancel'], [null], ['custom', 'n'], ['custom', null]])(
  'cancels before mutation with %j',
  async (...answers) => {
    const { ui } = interaction(answers);
    expect(await setupWizard(root, ui)).toBe(false);
    expect((await inspectInstallation(root, { PATH: '' })).state).toBe('uninitialized');
    await expect(readFile(join(root, '.arch/harness.toml'))).rejects.toThrow();
  },
);
it('supports custom names with no detected tools and validates duplicates/reserved names before mutation', async () => {
  const { ui, output } = interaction(['node', 'mytool mytool', 'mytool', 'yes']);
  expect(await setupWizard(root, ui)).toBe(true);
  expect((await inspectInstallation(root)).routes).toEqual(['mytool']);
  expect(output.join('\n')).toContain('reserved');
  expect(
    output.filter(
      (line) => 'Supply unique executable names (node, mise, and arch are reserved)' === line,
    ),
  ).toHaveLength(2);
  expect(output.join('\n')).toContain(root);
  expect(output.join('\n')).toContain('Shell activation has not been verified');
});
it('accepts installed defaults after a summary and explicit continuation', async () => {
  vi.mocked(discoverClis).mockResolvedValue([
    { command: 'claude', label: 'Claude Code', available: true },
    { command: 'gemini', label: 'Gemini', available: true },
  ]);
  const { ui, output } = interaction(['', '']);
  expect(await setupWizard(root, ui)).toBe(true);
  expect((await inspectInstallation(root)).routes).toEqual(['claude']);
  expect(output.join('\n')).toContain('Desired routes: claude');
  expect(output).toContain('Routed commands: ');
  expect(output).toContain('Proceed? [Y/n] ');
});
it('configuration changes only routes, inspection/cancellation do not mutate', async () => {
  await setup(root, ['tool']);
  const harness = join(root, '.arch/harness.toml');
  await writeFile(harness, 'user config');
  const original = await readFile(join(root, '.arch/bootstrap.json'));
  expect(await setupWizard(root, interaction(['2']).ui, true)).toBe(false);
  expect(await setupWizard(root, interaction(['4']).ui, true)).toBe(false);
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(original);
  expect(await setupWizard(root, interaction(['1', 'tool custom', 'y']).ui, true)).toBe(true);
  expect((await inspectInstallation(root)).routes).toEqual(['tool', 'custom']);
  expect(await readFile(harness, 'utf8')).toBe('user config');
});

it('explains discovered suggestions and deterministic equivalents before mutation', async () => {
  vi.mocked(discoverClis).mockResolvedValue([
    { command: 'claude', label: 'Claude Code', available: true },
    { command: 'codex', label: 'Codex', available: true },
    { command: 'missing', label: 'Missing CLI', available: false },
  ]);
  const { ui, output } = interaction(['node', 'custom other', 'no']);
  expect(await setupWizard(root, ui)).toBe(false);
  const text = output.join('\n');
  for (const fragment of [
    `Arch Setup\nProject: ${root}`,
    'Detected CLI suggestions (presence only; tools are never executed):',
    'Claude Code: claude (installed)',
    'Missing CLI: missing (not found)',
    'Enter executable names separated by spaces; custom names are supported.',
    'Default: claude, codex',
    'Enter cancel to stop.',
    'Desired routes: custom, other',
    'Project-scoped installation; native fallback enabled; middleware configuration preserved.',
    'init <commands...>, configure <commands...>, or deinit --yes.',
    'reserved',
  ]) {
    expect(text).toContain(fragment);
  }
  expect((await inspectInstallation(root)).state).toBe('uninitialized');
});

it('explains empty defaults and preserves configured defaults when init is repeated', async () => {
  const empty = interaction(['cancel']);
  expect(await setupWizard(root, empty.ui)).toBe(false);
  expect(empty.output.join('\n')).toContain('Default: (none)');
  await setup(root, ['tool', 'other']);
  const repeated = interaction(['', 'yes']);
  expect(await setupWizard(root, repeated.ui)).toBe(true);
  expect(repeated.output.join('\n')).toContain('Default: tool, other');
  expect((await inspectInstallation(root)).routes).toEqual(['tool', 'other']);
});

it('shows configuration state and returns without mutation from inspection', async () => {
  await setup(root, ['tool', 'other']);
  const status = await inspectInstallation(root);
  const { ui, output } = interaction(['2']);
  expect(await setupWizard(root, ui, true)).toBe(false);
  expect(output).toContain(`Arch Configuration\nProject: ${root}`);
  expect(output.join('\n')).toContain('Current configured routes: tool, other');
  expect(output.join('\n')).toContain(
    '1. Update routed commands\n2. Inspect installation\n3. Deinitialize Arch\n4. Cancel',
  );
  expect(output).toContain('Action [1-4]: ');
  expect(output).toContain(JSON.stringify(status, null, 2));
  expect(discoverClis).not.toHaveBeenCalled();
});

it.each([null, 'no'])(
  'declines removal from configuration without mutation (%j)',
  async (answer) => {
    await setup(root, ['tool']);
    expect(await setupWizard(root, interaction(['3', answer]).ui, true)).toBe(false);
    expect((await inspectInstallation(root)).state).toBe('initialized');
  },
);

it.each(['4', 'invalid', '', null])(
  'does not discover tools after cancelling configuration (%j)',
  async (action) => {
    await setup(root, ['tool']);
    const before = await readFile(join(root, '.arch/bootstrap.json'));
    const { ui } = interaction([action]);
    expect(await setupWizard(root, ui, true)).toBe(false);
    expect(discoverClis).not.toHaveBeenCalled();
    expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(before);
  },
);
it.each(['', 'no', null])('defaults deinitialization to No (%s)', async (answer) => {
  await setup(root, ['tool']);
  const original = await readFile(join(root, '.arch/bootstrap.json'));
  const { ui, output } = interaction([answer]);
  expect(await confirmRemoval(root, ui)).toBe(false);
  expect(output.join('\n')).toContain('[y/N]');
  const summary = output[0];
  assert(summary !== undefined);
  const lines = summary.split('\n');
  const firstResource = lines.indexOf('Managed resources:') + 1;
  const preserved = lines.findIndex((line) => line.startsWith('Preserved:'));
  assert(0 < firstResource && preserved > firstResource);
  expect(lines.slice(firstResource, preserved).map((line) => line.trim())).toEqual([
    ...(await inspectInstallation(root)).managedPaths,
    '.arch/bootstrap.json',
  ]);
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(original);
});
it('can deinitialize from the configuration menu after confirmation', async () => {
  await setup(root, ['tool']);
  const { ui, output } = interaction(['3', 'yes']);
  expect(await setupWizard(root, ui, true)).toBe(true);
  expect(output).toContain(
    'Arch project routing removed. Refresh the shell prompt to refresh command resolution.',
  );
  expect((await inspectInstallation(root)).state).toBe('uninitialized');
});
it('accepts a pre-existing harness without claiming ownership', async () => {
  await mkdir(join(root, '.arch'));
  const harness = join(root, '.arch/harness.toml');
  await writeFile(harness, 'schema=1\nmiddleware=[]\n');
  expect(await setupWizard(root, interaction(['custom', 'yes']).ui)).toBe(true);
  expect(stateFrom(await readFile(join(root, '.arch/bootstrap.json'))).createdHarness).toBe(false);
});

it.each([null, '', 'no', '1'])(
  'leaves pending recovery unchanged when resume is declined (%j)',
  async (answer) => {
    await setup(root, ['tool']);
    await expect(
      reconcileRoutes(root, ['other', 'third'], {
        checkpoint: (name) => {
          if ('journal' === name) {
            throw new Error('interrupt');
          }
        },
      }),
    ).rejects.toThrow('interrupt');
    const journal = await readFile(join(root, '.arch/routing.json'));
    const { ui, output } = interaction([answer]);
    expect(await setupWizard(root, ui, true)).toBe(false);
    expect(output.join('\n')).toContain('Interrupted routing update. Desired routes: other, third');
    expect(await readFile(join(root, '.arch/routing.json'))).toEqual(journal);
    expect(output).toContain('Resume this update? [y/N] ');
  },
);

it('resumes the recorded desired routes without rediscovery or a replacement plan', async () => {
  await setup(root, ['tool']);
  await expect(
    reconcileRoutes(root, ['other'], {
      checkpoint: (name) => {
        if ('journal' === name) {
          throw new Error('interrupt');
        }
      },
    }),
  ).rejects.toThrow('interrupt');
  const { ui, output } = interaction(['YES']);
  expect(await setupWizard(root, ui, true)).toBe(true);
  expect(output.join('\n')).toContain('Arch installed for this project:');
  expect((await inspectInstallation(root)).routes).toEqual(['other']);
  expect(discoverClis).not.toHaveBeenCalled();
});

it('refuses invalid routing recovery before offering a resume prompt or modifying resources', async () => {
  await setup(root, ['tool']);
  await expect(
    reconcileRoutes(root, ['other'], {
      checkpoint: (name) => {
        if ('journal' === name) {
          throw new Error('interrupt');
        }
      },
    }),
  ).rejects.toThrow('interrupt');
  const managed = join(root, '.config/mise/conf.d/arch.toml');
  const changed = Buffer.concat([await readFile(managed), Buffer.from('# external edit\n')]);
  await writeFile(managed, changed);
  expect(await inspectInstallation(root)).toMatchObject({
    state: 'invalid_state',
    pendingOperation: 'routing',
    desiredRoutes: ['other'],
  });
  const journal = await readFile(join(root, '.arch/routing.json'));
  const ask = vi.fn(() => Promise.resolve('yes'));
  const { ui } = interaction([]);
  ui.ask = ask;
  await expect(setupWizard(root, ui, true)).rejects.toThrow('Cannot configure: invalid_state.');
  expect(ask).not.toHaveBeenCalled();
  expect(await readFile(join(root, '.arch/routing.json'))).toEqual(journal);
  expect(await readFile(managed)).toEqual(changed);
});

it('propagates discovery and input errors without mutating installation state', async () => {
  const error = new Error('discovery failed');
  vi.mocked(discoverClis).mockRejectedValueOnce(error);
  await expect(setupWizard(root, interaction([]).ui)).rejects.toBe(error);
  const { ui } = interaction([]);
  ui.ask = () => Promise.reject(error);
  await expect(setupWizard(root, ui)).rejects.toBe(error);
  expect((await inspectInstallation(root)).state).toBe('uninitialized');
});

it.each(['uninitialized', 'invalid_state'] as const)(
  'refuses configuration from %s before discovery',
  async (state) => {
    if ('invalid_state' === state) {
      await mkdir(join(root, '.arch'));
      await writeFile(join(root, '.arch/bootstrap.json'), 'broken');
    }
    await expect(setupWizard(root, interaction([]).ui, true)).rejects.toThrow(
      `Cannot configure: ${state}.`,
    );
    expect(discoverClis).not.toHaveBeenCalled();
  },
);

it('describes recorded resources and recovery before requesting removal', async () => {
  await setup(root, ['tool']);
  const manifest = join(root, '.arch/bootstrap.json');
  const journal = join(root, '.arch/uninstall.json');
  await rename(manifest, journal);
  const before = await readFile(journal);
  const { ui, output } = interaction(['no']);
  expect(await confirmRemoval(root, ui)).toBe(false);
  const text = output.join('\n');
  for (const fragment of [
    `Arch Deinitialization\nProject: ${root}`,
    'Managed resources:',
    '.arch/bin/tool',
    '.config/mise/conf.d/arch.toml',
    '.arch/* operation journal (owned)',
    '.arch/bootstrap.json',
    'Preserved: modified/pre-existing .arch/harness.toml, unrelated files, native installations.',
    'An unchanged generated harness configuration may be removed.',
    'Remove Arch routing from this project? [y/N] ',
  ]) {
    expect(text).toContain(fragment);
  }
  expect(await readFile(journal)).toEqual(before);
  await expect(setupWizard(root, interaction([]).ui)).rejects.toThrow(
    'Cannot initialize: recovery_pending.',
  );
  await expect(setupWizard(root, interaction([]).ui, true)).rejects.toThrow(
    'Cannot configure: recovery_pending.',
  );
});
