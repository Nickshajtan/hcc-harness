import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { discoverClis, defaultSelection } from './discovery.js';
import {
  configuredRoutes,
  deinitialize,
  inspectInstallation,
  reconcileRoutes,
} from './lifecycle.js';
import { setup, validateCommands } from './setup.js';

export interface Interaction {
  ask(message: string): Promise<string | null>;
  write(message: string): void;
}
export function terminalInteraction() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const lines = terminal[Symbol.asyncIterator]();
  terminal.on('SIGINT', () => {
    process.exitCode = 130;
    terminal.close();
  });
  return {
    ask: async (message: string) => {
      process.stdout.write(message);
      const next = await lines.next();
      return next.done ? null : next.value;
    },
    write: (message: string) => {
      console.log(message);
    },
    close: () => terminal.close(),
  };
}
export async function confirmRemoval(root: string, ui: Interaction): Promise<boolean> {
  const status = await inspectInstallation(root);
  ui.write(
    `Arch Deinitialization\nProject: ${resolve(root)}\nManaged resources:\n${[...status.managedPaths, ...(status.recoveryPending ? ['.arch/* operation journal (owned)'] : []), '.arch/bootstrap.json'].map((path) => `  ${path}`).join('\n')}\nPreserved: modified/pre-existing .arch/harness.toml, unrelated files, native installations.\nAn unchanged generated harness configuration may be removed.`,
  );
  const answer = await ui.ask('Remove Arch routing from this project? [y/N] ');
  return answer !== null && /^(y|yes)$/i.test(answer.trim());
}
export function installedMessage(root: string) {
  return `Arch installed for this project: ${resolve(root)}\nManaged paths: .arch/bin/*, .arch/bootstrap.json, .config/mise/conf.d/arch.toml\nShell activation has not been verified. Activate mise, refresh the shell prompt, and trust the project when prompted.\nFor explicit activation: mise exec -- <command>`;
}
export const removedMessage =
  'Arch project routing removed. Refresh the shell prompt to refresh command resolution.';

export async function setupWizard(
  root: string,
  ui: Interaction,
  configure = false,
): Promise<boolean> {
  root = resolve(root);
  const status = await inspectInstallation(root);
  ui.write(`Arch ${configure ? 'Configuration' : 'Setup'}\nProject: ${root}`);
  if (configure) {
    if (status.pendingOperation === 'routing' && status.state === 'recovery_pending') {
      ui.write(`Interrupted routing update. Desired routes: ${status.desiredRoutes!.join(', ')}`);
      const answer = await ui.ask('Resume this update? [y/N] ');
      if (answer === null || !/^(y|yes)$/i.test(answer.trim())) return false;
      await reconcileRoutes(root, status.desiredRoutes!);
      ui.write(installedMessage(root));
      return true;
    }
    if (status.state !== 'initialized')
      throw new Error(`Cannot configure: ${status.state}. ${status.warnings.join(' ')}`);
    ui.write(
      `Current configured routes: ${status.routes.join(', ')}\n1. Update routed commands\n2. Inspect installation\n3. Deinitialize Arch\n4. Cancel`,
    );
    const action = await ui.ask('Action [1-4]: ');
    if (action === '2') {
      ui.write(JSON.stringify(status, null, 2));
      return false;
    }
    if (action === '3') {
      if (!(await confirmRemoval(root, ui))) return false;
      await deinitialize(root);
      ui.write(removedMessage);
      return true;
    }
    if (action !== '1') return false;
  } else if (!['initialized', 'uninitialized'].includes(status.state))
    throw new Error(`Cannot initialize: ${status.state}. ${status.warnings.join(' ')}`);
  const candidates = await discoverClis(root);
  const current = status.state === 'initialized' ? await configuredRoutes(root) : [];
  const defaults = defaultSelection(candidates, current);
  ui.write('Detected CLI suggestions (presence only; tools are never executed):');
  for (const candidate of candidates)
    ui.write(
      `  ${candidate.label}: ${candidate.command} (${candidate.available ? 'installed' : 'not found'})`,
    );
  ui.write(
    `Enter executable names separated by spaces; custom names are supported.\nDefault: ${defaults.join(', ') || '(none)'}\nEnter cancel to stop.`,
  );
  let selected: string[];
  for (;;) {
    const answer = await ui.ask('Routed commands: ');
    if (answer === null || answer.trim().toLowerCase() === 'cancel') return false;
    selected = answer.trim() ? answer.trim().split(/\s+/) : defaults;
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
  if (answer === null || !/^(y|yes)?$/i.test(answer.trim())) return false;
  if (current.length) await reconcileRoutes(root, selected);
  else await setup(root, selected);
  ui.write(installedMessage(root));
  return true;
}
