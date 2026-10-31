export {
  configText,
  routePath,
  statePath,
  uninstallPath,
  digest,
  stateFrom,
  validateCommands,
  type State,
} from './lifecycle/manifest.js';
export { readOptional, checkFiles, assertSafePath } from './lifecycle/ownership.js';

export { setup } from './installation/setup.js';
export { renderFiles } from './installation/renderer.js';
export { uninstall } from './lifecycle/removal.js';
