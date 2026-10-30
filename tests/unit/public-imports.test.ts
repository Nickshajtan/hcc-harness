import { expect, it } from 'vitest';
import * as core from '../../src/core.js';
import * as lifecycle from '../../src/lifecycle.js';
import * as setup from '../../src/setup.js';
import * as nativeProcess from '../../src/process.js';
import * as commands from '../../src/commands.js';
import * as wizard from '../../src/wizard.js';

it('preserves the established runtime export surfaces', () => {
  expect(Object.keys(core).sort()).toEqual(['defaultRegistry', 'execute']);
  expect(Object.keys(commands).sort()).toEqual(['UsageError', 'help', 'publicCommand']);
  expect(Object.keys(wizard).sort()).toEqual([
    'confirmRemoval',
    'installedMessage',
    'removedMessage',
    'setupWizard',
    'terminalInteraction',
  ]);
  expect(Object.keys(nativeProcess).sort()).toEqual([
    'launch',
    'nativeEnvironment',
    'resolveExecutable',
    'routerMarker',
  ]);
  expect(Object.keys(lifecycle).sort()).toEqual([
    'addRoutes',
    'configuredRoutes',
    'deinitialize',
    'inspectInstallation',
    'manifestRoutes',
    'planRoutes',
    'reconcileRoutes',
    'removeRoutes',
    'routingPath',
    'setup',
  ]);
  expect(Object.keys(setup).sort()).toEqual(
    [
      'assertSafePath',
      'checkFiles',
      'configText',
      'digest',
      'readOptional',
      'renderFiles',
      'routePath',
      'setup',
      'stateFrom',
      'statePath',
      'uninstall',
      'uninstallPath',
      'validateCommands',
    ].sort(),
  );
  expect(lifecycle.setup).toBe(setup.setup);
});
