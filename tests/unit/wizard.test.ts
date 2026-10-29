import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confirmRemoval, setupWizard, type Interaction } from '../../src/wizard.js';
import { inspectInstallation } from '../../src/lifecycle.js';
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
it.each(['', 'no', null])('defaults deinitialization to No (%s)', async (answer) => {
  await setup(root, ['tool']);
  const original = await readFile(join(root, '.arch/bootstrap.json'));
  const { ui, output } = interaction([answer]);
  expect(await confirmRemoval(root, ui)).toBe(false);
  expect(output.join('\n')).toContain('[y/N]');
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(original);
});
it('can deinitialize from the configuration menu after confirmation', async () => {
  await setup(root, ['tool']);
  expect(await setupWizard(root, interaction(['3', 'yes']).ui, true)).toBe(true);
  expect((await inspectInstallation(root)).state).toBe('uninitialized');
});
it('accepts a pre-existing harness without claiming ownership', async () => {
  await mkdir(join(root, '.arch'));
  const harness = join(root, '.arch/harness.toml');
  await writeFile(harness, 'schema=1\nmiddleware=[]\n');
  expect(await setupWizard(root, interaction(['custom', 'yes']).ui)).toBe(true);
  expect(
    JSON.parse(await readFile(join(root, '.arch/bootstrap.json'), 'utf8')).createdHarness,
  ).toBe(false);
});
