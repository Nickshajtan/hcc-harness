import { expect, it } from 'vitest';
import * as core from '../../src/core.js';
import * as lifecycle from '../../src/lifecycle.js';
import * as setup from '../../src/setup.js';

it('preserves the established runtime export surfaces', () => {
  expect(Object.keys(core).sort()).toEqual(['defaultRegistry', 'execute']);
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
