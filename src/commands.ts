import {
  addRoutes,
  configuredRoutes,
  deinitialize,
  inspectInstallation,
  reconcileRoutes,
  removeRoutes,
} from './lifecycle.js';
import { setup } from './setup.js';
import {
  confirmRemoval,
  installedMessage,
  removedMessage,
  setupWizard,
  terminalInteraction,
} from './wizard.js';

export class UsageError extends Error {}
export const help = `Arch project routing\nUsage:\n  arch init [commands...]\n  arch configure [commands...]\n  arch route list\n  arch route add <commands...>\n  arch route remove <commands...>\n  arch status [--json]\n  arch deinit [--yes]\n  arch uninstall [--yes]  (deprecated, prompt-free compatibility alias)\n  arch run <command> -- [args...]\n  arch --help\nBare init/configure require an interactive terminal. Explicit command sets never prompt.\nInstallation does not verify activation in the current shell.`;
function usage(message: string): never {
  throw new UsageError(`${message}\n${help}`);
}
export async function publicCommand(args: readonly string[]): Promise<void> {
  const [operation, ...rest] = args,
    root = process.cwd();
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;
  if (operation === '--help' && !rest.length) {
    console.log(help);
    return;
  }
  if (operation === 'init' || operation === 'configure') {
    if (rest.some((arg) => arg.startsWith('-'))) usage('Unknown option');
    if (rest.length) {
      if (operation === 'init') await setup(root, rest);
      else await reconcileRoutes(root, rest);
      console.log(installedMessage(root));
      return;
    }
    if (!interactive) usage(`Use ${operation} <commands...> outside an interactive terminal`);
    const ui = terminalInteraction();
    try {
      await setupWizard(root, ui, operation === 'configure');
    } finally {
      ui.close();
    }
    return;
  }
  if (operation === 'status') {
    if (rest.length && (rest.length !== 1 || rest[0] !== '--json'))
      usage('Expected status [--json]');
    const status = await inspectInstallation(root);
    console.log(
      rest[0] === '--json'
        ? JSON.stringify(status, null, 2)
        : `Project: ${status.projectRoot}\nInstallation: ${status.state}\nConfigured routes: ${status.routes.join(', ') || '(none)'}\nIntegrity: ${status.integrity}\nPending recovery: ${status.recoveryPending}\nActivation: shell unknown; mise ${status.activation.miseAvailable === true ? 'detected' : status.activation.miseAvailable === false ? 'not detected' : 'unknown'}; project bin ${status.activation.projectBinOnPath ? 'on PATH' : 'not on PATH'}\n${status.warnings.join('\n')}`,
    );
    if (status.state === 'invalid_state') process.exitCode = 1;
    return;
  }
  if (operation === 'route') {
    const [action, ...commands] = rest;
    if (action === 'list' && !commands.length) {
      console.log((await configuredRoutes(root)).join('\n'));
      return;
    }
    if (!commands.length || commands.some((command) => command.startsWith('-')))
      usage('Expected route list | route add/remove <commands...>');
    if (action === 'add') await addRoutes(root, commands);
    else if (action === 'remove') await removeRoutes(root, commands);
    else usage('Unknown route operation');
    console.log('Configured routing updated. Shell activation has not been verified.');
    return;
  }
  if (operation === 'deinit' || operation === 'uninstall') {
    if (rest.length && (rest.length !== 1 || rest[0] !== '--yes'))
      usage('Expected deinit/uninstall [--yes]');
    if (operation === 'uninstall')
      console.error('[arch] uninstall is deprecated; use deinit --yes for unattended removal.');
    if (operation === 'deinit' && !rest.length) {
      if (!interactive) usage('Removal requires deinit --yes outside an interactive terminal');
      const ui = terminalInteraction();
      try {
        if (!(await confirmRemoval(root, ui))) return;
      } finally {
        ui.close();
      }
    }
    await deinitialize(root);
    console.log(removedMessage);
    return;
  }
  usage('Unknown command');
}
