import { resolve } from 'node:path';
import { discoverClis, defaultSelection } from '../discovery.js';
import {
  configuredRoutes,
  deinitialize,
  inspectInstallation,
  reconcileRoutes,
} from '../lifecycle.js';
import { setup, validateCommands } from '../setup.js';

import type { Interaction } from './terminal.js';
import { installedMessage, removedMessage } from './presentation.js';
import { removalConfirmed, setupConfirmed, selectedCommands } from './decisions.js';

export async function confirmRemoval(root: string, ui: Interaction): Promise<boolean> {
  const status = await inspectInstallation(root);
  ui.write(
    `Arch Deinitialization\nProject: ${resolve(root)}\nManaged resources:\n${[...status.managedPaths, ...(status.recoveryPending ? ['.arch/* operation journal (owned)'] : []), '.arch/bootstrap.json'].map((path) => `  ${path}`).join('\n')}\nPreserved: modified/pre-existing .arch/harness.toml, unrelated files, native installations.\nAn unchanged generated harness configuration may be removed.`,
  );
  const answer = await ui.ask('Remove Arch routing from this project? [y/N] ');
  return removalConfirmed(answer);
}
export async function setupWizard(
  root: string,
  ui: Interaction,
  configure = false,
): Promise<boolean> {
  root = resolve(root);
  const status = await inspectInstallation(root);
  ui.write(`Arch ${configure ? 'Configuration' : 'Setup'}\nProject: ${root}`);
  if (configure) {
    if ('routing' === status.pendingOperation && 'recovery_pending' === status.state) {
      const desiredRoutes = status.desiredRoutes;
      // Inspection supplies these only after journal validation. Never resume
      // from an incomplete internal status or manufacture a replacement plan.
      if (desiredRoutes === undefined) {
        throw new Error('Routing recovery status is missing desired routes');
      }
      ui.write(`Interrupted routing update. Desired routes: ${desiredRoutes.join(', ')}`);
      const answer = await ui.ask('Resume this update? [y/N] ');
      if (!removalConfirmed(answer)) {
        return false;
      }
      await reconcileRoutes(root, desiredRoutes);
      ui.write(installedMessage(root));
      return true;
    }
    if ('initialized' !== status.state) {
      throw new Error(`Cannot configure: ${status.state}. ${status.warnings.join(' ')}`);
    }
    ui.write(
      `Current configured routes: ${status.routes.join(', ')}\n1. Update routed commands\n2. Inspect installation\n3. Deinitialize Arch\n4. Cancel`,
    );
    const action = await ui.ask('Action [1-4]: ');
    if ('2' === action) {
      ui.write(JSON.stringify(status, null, 2));
      return false;
    }
    if ('3' === action) {
      if (!(await confirmRemoval(root, ui))) {
        return false;
      }
      await deinitialize(root);
      ui.write(removedMessage);
      return true;
    }
    if ('1' !== action) {
      return false;
    }
  } else if (!['initialized', 'uninitialized'].includes(status.state)) {
    throw new Error(`Cannot initialize: ${status.state}. ${status.warnings.join(' ')}`);
  }
  const candidates = await discoverClis(root);
  const current = 'initialized' === status.state ? await configuredRoutes(root) : [];
  const defaults = defaultSelection(candidates, current);
  ui.write('Detected CLI suggestions (presence only; tools are never executed):');
  for (const candidate of candidates) {
    ui.write(
      `  ${candidate.label}: ${candidate.command} (${candidate.available ? 'installed' : 'not found'})`,
    );
  }
  ui.write(
    `Enter executable names separated by spaces; custom names are supported.\nDefault: ${defaults.join(', ') || '(none)'}\nEnter cancel to stop.`,
  );
  let selected: string[];
  for (;;) {
    const answer = await ui.ask('Routed commands: ');
    const commands = selectedCommands(answer, defaults);
    if (null === commands) {
      return false;
    }
    selected = commands;
    try {
      validateCommands(selected);
      break;
    } catch (error) {
      ui.write(error instanceof Error ? error.message : String(error));
    }
  }
  ui.write(
    `Desired routes: ${selected.join(', ')}\nProject-scoped installation; native fallback enabled; middleware configuration preserved.\nEach operation is also available as init <commands...>, configure <commands...>, or deinit --yes.`,
  );
  const answer = await ui.ask('Proceed? [Y/n] ');
  if (!setupConfirmed(answer)) {
    return false;
  }
  if (current.length) {
    await reconcileRoutes(root, selected);
  } else {
    await setup(root, selected);
  }
  ui.write(installedMessage(root));
  return true;
}
