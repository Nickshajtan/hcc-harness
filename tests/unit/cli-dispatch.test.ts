import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { publicCommand } from '../../src/commands.js';
import {
  addRoutes,
  configuredRoutes,
  deinitialize,
  inspectInstallation,
  reconcileRoutes,
  removeRoutes,
} from '../../src/lifecycle.js';
import { setup } from '../../src/setup.js';
import { confirmRemoval, setupWizard } from '../../src/wizard/workflow.js';
import { terminalInteraction } from '../../src/wizard/terminal.js';
import type { InstallationStatus } from '../../src/lifecycle.js';

vi.mock('../../src/lifecycle.js', () => ({
  addRoutes: vi.fn(),
  configuredRoutes: vi.fn(),
  deinitialize: vi.fn(),
  inspectInstallation: vi.fn(),
  reconcileRoutes: vi.fn(),
  removeRoutes: vi.fn(),
}));
vi.mock('../../src/setup.js', () => ({ setup: vi.fn() }));
vi.mock('../../src/wizard/workflow.js', () => ({ confirmRemoval: vi.fn(), setupWizard: vi.fn() }));
vi.mock('../../src/wizard/terminal.js', () => ({ terminalInteraction: vi.fn() }));

const close = vi.fn();
const ui = { ask: vi.fn(), write: vi.fn(), close };
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const originalExitCode = process.exitCode;
const status: InstallationStatus = {
  schema: 1,
  projectRoot: '/project',
  state: 'initialized',
  routes: ['tool'],
  integrity: 'valid',
  recoveryPending: false,
  managedPaths: [],
  warnings: [],
  activation: { miseAvailable: null, projectBinOnPath: false, shellActivation: 'unknown' },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  vi.mocked(terminalInteraction).mockReturnValue(ui);
  vi.mocked(inspectInstallation).mockResolvedValue(structuredClone(status));
  vi.mocked(configuredRoutes).mockResolvedValue(['tool', 'other']);
  process.exitCode = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [stream, descriptor] of [
    [process.stdin, stdinTTY],
    [process.stdout, stdoutTTY],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(stream, 'isTTY', descriptor);
    } else {
      Reflect.deleteProperty(stream, 'isTTY');
    }
  }
  process.exitCode = originalExitCode;
});

it.each(['init', 'configure'] as const)(
  'executes explicit %s without creating terminal resources',
  async (operation) => {
    await publicCommand([operation, 'custom']);
    expect('init' === operation ? setup : reconcileRoutes).toHaveBeenCalledExactlyOnceWith(
      process.cwd(),
      ['custom'],
    );
    expect('init' === operation ? reconcileRoutes : setup).not.toHaveBeenCalled();
    expect(terminalInteraction).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Shell activation has not been verified.'),
    );
  },
);
it.each(['init', 'configure'] as const)(
  'closes the %s terminal exactly once after an operation failure',
  async (operation) => {
    const error = new Error('wizard failure');
    vi.mocked(setupWizard).mockRejectedValue(error);
    await expect(publicCommand([operation])).rejects.toBe(error);
    expect(setupWizard).toHaveBeenCalledExactlyOnceWith(
      process.cwd(),
      ui,
      'configure' === operation,
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  },
);
it('closes the terminal after cancelled and completed setup without inventing a success message', async () => {
  for (const result of [false, true]) {
    vi.mocked(setupWizard).mockResolvedValueOnce(result);
    await publicCommand(['init']);
  }
  expect(close).toHaveBeenCalledTimes(2);
  expect(console.log).not.toHaveBeenCalled();
});
it.each([false, true])(
  'preserves deinit confirmation %s and closes before mutation',
  async (confirmed) => {
    vi.mocked(confirmRemoval).mockResolvedValue(confirmed);
    vi.mocked(deinitialize).mockImplementation(() => {
      expect(close).toHaveBeenCalledTimes(1);
      return Promise.resolve();
    });
    await publicCommand(['deinit']);
    expect(confirmRemoval).toHaveBeenCalledExactlyOnceWith(process.cwd(), ui);
    expect(close).toHaveBeenCalledTimes(1);
    expect(deinitialize).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    expect(console.log).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  },
);
it('closes after confirmation failure and never removes resources', async () => {
  const error = new Error('input failure');
  vi.mocked(confirmRemoval).mockRejectedValue(error);
  await expect(publicCommand(['deinit'])).rejects.toBe(error);
  expect(close).toHaveBeenCalledTimes(1);
  expect(deinitialize).not.toHaveBeenCalled();
});
it.each([['deinit', '--yes'], ['uninstall'], ['uninstall', '--yes']])(
  'removes without prompting for %j',
  async (...args) => {
    await publicCommand(args);
    expect(deinitialize).toHaveBeenCalledExactlyOnceWith(process.cwd());
    expect(terminalInteraction).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes('uninstall' === args[0] ? 1 : 0);
    if ('uninstall' === args[0]) {
      expect(console.error).toHaveBeenCalledWith(
        '[arch] uninstall is deprecated; use deinit --yes for unattended removal.',
      );
    }
  },
);
it('does not print success when unattended removal fails', async () => {
  const error = new Error('managed file changed');
  vi.mocked(deinitialize).mockRejectedValue(error);
  await expect(publicCommand(['uninstall'])).rejects.toBe(error);
  expect(console.error).toHaveBeenCalledTimes(1);
  expect(console.log).not.toHaveBeenCalled();
});
it.each(['add', 'remove'] as const)(
  'dispatches route %s to exactly one lifecycle operation',
  async (action) => {
    await publicCommand(['route', action, 'custom']);
    expect('add' === action ? addRoutes : removeRoutes).toHaveBeenCalledExactlyOnceWith(
      process.cwd(),
      ['custom'],
    );
    expect('add' === action ? removeRoutes : addRoutes).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      'Configured routing updated. Shell activation has not been verified.',
    );
  },
);
it('lists routes without mutation', async () => {
  await publicCommand(['route', 'list']);
  expect(console.log).toHaveBeenCalledExactlyOnceWith('tool\nother');
  expect(addRoutes).not.toHaveBeenCalled();
  expect(removeRoutes).not.toHaveBeenCalled();
});
it('prints help without inspecting or mutating installation state', async () => {
  await publicCommand(['--help']);
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Arch project routing'));
  expect(inspectInstallation).not.toHaveBeenCalled();
});
it('preserves exact status JSON and invalid-state exit mapping', async () => {
  const invalid: InstallationStatus = { ...status, state: 'invalid_state', warnings: ['broken'] };
  vi.mocked(inspectInstallation).mockResolvedValue(invalid);
  await publicCommand(['status', '--json']);
  expect(console.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(invalid, null, 2));
  expect(process.exitCode).toBe(1);
});
it.each([
  [null, 'unknown'],
  [false, 'not detected'],
  [true, 'detected'],
] as const)(
  'renders mise observation %s without claiming shell activation',
  async (miseAvailable, observation) => {
    vi.mocked(inspectInstallation).mockResolvedValue({
      ...status,
      routes: [],
      activation: { miseAvailable, projectBinOnPath: true, shellActivation: 'unknown' },
      warnings: ['warning'],
    });
    await publicCommand(['status']);
    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      `Project: /project\nInstallation: initialized\nConfigured routes: (none)\nIntegrity: valid\nPending recovery: false\nActivation: shell unknown; mise ${observation}; project bin on PATH\nwarning`,
    );
    expect(process.exitCode).toBeUndefined();
  },
);
it('renders configured routes and absent project PATH', async () => {
  vi.mocked(inspectInstallation).mockResolvedValue({
    ...status,
    routes: ['tool', 'other'],
    warnings: ['first', 'second'],
  });
  await publicCommand(['status']);
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('Configured routes: tool, other'),
  );
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('project bin not on PATH'));
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('first\nsecond'));
});

it.each([
  [false, false],
  [false, true],
  [true, false],
])('requires both TTYs for interactive setup (%s, %s)', async (input, output) => {
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: input });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: output });
  await expect(publicCommand(['init'])).rejects.toThrow(
    'Use init <commands...> outside an interactive terminal',
  );
  expect(terminalInteraction).not.toHaveBeenCalled();
  expect(setup).not.toHaveBeenCalled();
});
