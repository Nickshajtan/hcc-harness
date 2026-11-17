import { resolveProjectLayout } from '../project-layout.js';
import {
  addRoutes,
  configuredRoutes,
  deinitialize,
  inspectInstallation,
  reconcileRoutes,
  removeRoutes,
} from '../lifecycle.js';
import { setup } from '../setup.js';
import { confirmRemoval, setupWizard } from '../wizard/workflow.js';
import { installedMessage, removedMessage } from '../wizard/presentation.js';
import { help, parseManagement, type ManagementRequest } from './parsing.js';
import { statusMessage } from './presentation.js';

async function configureProject(
  root: string,
  request: Extract<ManagementRequest, { operation: 'init' | 'configure' }>,
): Promise<void> {
  if (request.commands.length) {
    if ('init' === request.operation) {
      if (undefined === request.configurationDirectory) {
        await setup(root, request.commands);
      } else {
        await setup(root, request.commands, request.configurationDirectory);
      }
    } else {
      await reconcileRoutes(root, request.commands);
    }
    const layout = await resolveProjectLayout(root, request.configurationDirectory);
    console.log(installedMessage(layout.projectRoot, layout.directory));
    return;
  }
  const { terminalInteraction } = await import('../wizard/terminal.js');
  const ui = terminalInteraction();
  try {
    if (undefined === request.configurationDirectory) {
      await setupWizard(root, ui, 'configure' === request.operation);
    } else {
      await setupWizard(root, ui, false, request.configurationDirectory);
    }
  } finally {
    ui.close();
  }
}

async function removeProject(
  root: string,
  request: Extract<ManagementRequest, { operation: 'deinit' | 'uninstall' }>,
): Promise<void> {
  if ('uninstall' === request.operation) {
    console.error('[arch] uninstall is deprecated; use deinit --yes for unattended removal.');
  }
  if ('deinit' === request.operation && !request.yes) {
    const { terminalInteraction } = await import('../wizard/terminal.js');
    const ui = terminalInteraction();
    try {
      if (!(await confirmRemoval(root, ui))) {
        return;
      }
    } finally {
      ui.close();
    }
  }
  await deinitialize(root);
  console.log(removedMessage);
}

export async function publicCommand(args: readonly string[]): Promise<void> {
  const request = parseManagement(args, process.stdin.isTTY && process.stdout.isTTY);
  if ('help' === request.operation) {
    console.log(help);
    return;
  }
  const layout = await resolveProjectLayout(
    process.cwd(),
    'init' === request.operation ? request.configurationDirectory : undefined,
  );
  const root = layout.projectRoot;
  switch (request.operation) {
    case 'init':
    case 'configure':
      await configureProject(root, request);
      return;
    case 'status': {
      const status = await inspectInstallation(root);
      console.log(request.json ? JSON.stringify(status, null, 2) : statusMessage(status));
      if ('invalid_state' === status.state) {
        process.exitCode = 1;
      }
      return;
    }
    case 'route-list':
      console.log((await configuredRoutes(root)).join('\n'));
      return;
    case 'route-add':
      await addRoutes(root, request.commands);
      break;
    case 'route-remove':
      await removeRoutes(root, request.commands);
      break;
    case 'deinit':
    case 'uninstall':
      await removeProject(root, request);
      return;
  }
  console.log('Configured routing updated. Shell activation has not been verified.');
}
