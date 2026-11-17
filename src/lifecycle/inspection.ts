import { resolveProjectLayoutAt, type ProjectLayout } from '../project-layout.js';
import { lstat, readdir } from 'node:fs/promises';
import { assertSafePath } from './ownership.js';
import { assertBootstrapAuthority } from './setup-claim.js';
import { join, resolve, delimiter } from 'node:path';
import { nativeEnvironment, resolveExecutable } from '../process.js';
import { parseConfiguration } from '../config.js';
import { stateFrom, manifestRoutes, key } from './manifest.js';
import { checkFiles } from './ownership.js';
import { journalFrom } from './routing-journal.js';
import { readAt } from './routing-files.js';
import { validateRecovery } from './recovery-validation.js';
export interface InstallationStatus {
  schema: 1;
  setup?: {
    claimPresent: boolean;
    bootstrapPresent: boolean;
    stagingPaths: string[];
    manualRecoveryRequired: boolean;
    documentation: string;
  };
  projectRoot: string;
  state: 'uninitialized' | 'initialized' | 'recovery_pending' | 'invalid_state';
  routes: string[];
  integrity: 'valid' | 'invalid' | 'not_applicable';
  recoveryPending: boolean;
  managedPaths: string[];
  warnings: string[];
  pendingOperation?: 'routing' | 'uninstall';
  desiredRoutes?: string[];
  activation: {
    miseAvailable: boolean | null;
    projectBinOnPath: boolean;
    shellActivation: 'unknown';
  };
}
export async function inspectInstallation(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
  resolvedLayout?: ProjectLayout,
): Promise<InstallationStatus> {
  const layout = resolvedLayout ?? (await resolveProjectLayoutAt(root));
  root = layout.projectRoot;
  const pathKey = Object.keys(env).find((name) => 'PATH' === name.toUpperCase()) ?? 'PATH';
  const status: InstallationStatus = {
    schema: 1,
    projectRoot: root,
    state: 'uninitialized',
    routes: [],
    integrity: 'not_applicable',
    recoveryPending: false,
    managedPaths: [],
    warnings: [],
    activation: {
      miseAvailable: null,
      projectBinOnPath: (env[pathKey] ?? '')
        .split(delimiter)
        .filter(Boolean)
        .some((path) => key(resolve(root, path)) === key(join(root, layout.binDirectory))),
      shellActivation: 'unknown',
    },
  };
  await observeMise(root, env, status);
  try {
    await inspectSetup(root, status, layout);
    await inspectOwnership(root, status, layout);
    await inspectMiddlewareConfiguration(root, status, layout);
  } catch (error) {
    status.state = 'invalid_state';
    status.integrity = 'invalid';
    status.warnings.push(
      `${error instanceof Error ? error.message : String(error)}. Restore recorded owned bytes or resolve the ownership conflict before mutation.`,
    );
  }
  return status;
}

// Availability is an observation, never proof of shell activation or ownership.
async function observeMise(root: string, env: NodeJS.ProcessEnv, status: InstallationStatus) {
  try {
    await resolveExecutable('mise', root, await nativeEnvironment(env, root));
    status.activation.miseAvailable = true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Native executable not found:')) {
      status.activation.miseAvailable = false;
    }
  }
  if (true !== status.activation.miseAvailable) {
    status.warnings.push(
      'mise was not detected; install and activate mise, then refresh the shell and trust the project when prompted.',
    );
  }
  status.warnings.push(
    'Shell activation is not verified; PATH presence alone does not prove routing. Use mise exec -- <command> for explicit activation.',
  );
}

async function inspectMiddlewareConfiguration(
  root: string,
  status: InstallationStatus,
  layout: ProjectLayout,
) {
  const harness = await readAt(root, layout.configurationPath);
  if ('initialized' === status.state && harness === undefined) {
    status.warnings.push('Middleware configuration is absent; execution uses native fallback.');
  }
  if (harness !== undefined) {
    try {
      parseConfiguration(harness.toString(), root);
    } catch {
      status.warnings.push(
        `Middleware configuration is invalid; restore valid ${layout.configurationPath} before execution. Routing ownership is reported independently.`,
      );
    }
  }
}

// This read-only operation classifies recorded ownership; it never repairs an incomplete state.
async function inspectOwnership(root: string, status: InstallationStatus, layout: ProjectLayout) {
  const { statePath, uninstallPath, routingPath, journalStage } = layout;
  await assertBootstrapAuthority(root, layout);
  const [bootstrap, removal, routing] = await Promise.all(
    [statePath, uninstallPath, routingPath].map((path) => readAt(root, path)),
  );
  const recorded = removal ?? bootstrap;
  status.recoveryPending = removal !== undefined || routing !== undefined;
  if (
    (bootstrap !== undefined && removal !== undefined) ||
    (removal !== undefined && routing !== undefined)
  ) {
    throw new Error('Conflicting bootstrap/operation journals');
  }
  if (routing !== undefined) {
    const journal = journalFrom(routing, layout);
    status.pendingOperation = 'routing';
    status.desiredRoutes = manifestRoutes(journal.after, layout).commands;
    status.routes = manifestRoutes(journal.before, layout).commands;
    status.managedPaths = [
      ...new Set([...Object.keys(journal.before.files), ...Object.keys(journal.after.files)]),
    ];
    await validateRecovery(root, journal, layout);
    status.state = 'recovery_pending';
    status.integrity = 'valid';
    status.warnings.push(
      `Resume with configure ${status.desiredRoutes.join(' ')} or deinit --yes.`,
    );
  } else if (recorded !== undefined) {
    const state = stateFrom(recorded, layout);
    status.managedPaths = Object.keys(state.files);
    if (removal !== undefined) {
      status.pendingOperation = 'uninstall';
      await checkFiles(root, state.files, true);
      status.state = 'recovery_pending';
      status.warnings.push('Resume with deinit --yes (or legacy uninstall).');
    } else {
      status.routes = manifestRoutes(state, layout).commands;
      await checkFiles(root, state.files);
      status.state = 'initialized';
    }
    status.integrity = 'valid';
  }
  if (!routing && (await readAt(root, journalStage)) !== undefined) {
    status.warnings.push(
      `Unreferenced ${journalStage}; inspect and move it before another routing update.`,
    );
  }
}

// Inspect names and entry presence only. Never read claim/stage contents or follow links.
async function inspectSetup(
  root: string,
  status: InstallationStatus,
  layout: ProjectLayout,
): Promise<void> {
  await assertSafePath(root, layout.directory);
  let entries: string[];
  try {
    entries = await readdir(layout.configurationDirectory);
  } catch (error) {
    if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
      throw error;
    }
    entries = [];
  }
  const stagingPaths: string[] = [];
  for (const name of entries.filter((entry) => entry.startsWith('.setup-')).sort()) {
    const path = join(layout.directory, name);
    if ((await lstat(join(root, path))).isDirectory()) {
      stagingPaths.push(layout.directory + '/' + name);
    }
  }
  const claimPresent = entries.includes('setup-claim');
  status.setup = {
    claimPresent,
    bootstrapPresent: entries.includes('bootstrap.json'),
    stagingPaths,
    manualRecoveryRequired: claimPresent || 0 < stagingPaths.length,
    documentation: 'docs/usage.md#recovering-an-interrupted-init',
  };
  if (status.setup.manualRecoveryRequired) {
    status.warnings.push(
      `Setup inspection: claim ${String(claimPresent)}; bootstrap ${String(status.setup.bootstrapPresent)}; stages ${stagingPaths.join(', ') || '(none)'}. Manual inspection required: ${status.setup.documentation}`,
    );
  }
}
