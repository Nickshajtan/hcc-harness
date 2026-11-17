import { resolveProjectLayoutAt, type ProjectLayout } from '../project-layout.js';
import { assertBootstrapAuthority } from './setup-claim.js';
import { randomUUID } from 'node:crypto';
import { setup } from '../installation/setup.js';
import { uninstall } from './removal.js';
import { stateFrom, validateCommands, manifestRoutes, equal, key, digest } from './manifest.js';
import { routingPath, journalFrom, type RoutingJournal } from './routing-journal.js';
import { readAt, stage, publishExclusive } from './routing-files.js';
import { applyJournal, type LifecycleOptions } from './recovery.js';
import { planRoutes } from './routing-plan.js';
import { inspectInstallation } from './inspection.js';
export { setup, planRoutes, inspectInstallation, routingPath, manifestRoutes };
export type { RoutingPlan } from './routing-plan.js';
export type { LifecycleOptions } from './recovery.js';
export type { InstallationStatus } from './inspection.js';
export async function reconcileRoutes(
  root: string,
  commands: readonly string[],
  options: LifecycleOptions = {},
  resolvedLayout?: ProjectLayout,
): Promise<void> {
  const layout = resolvedLayout ?? (await resolveProjectLayoutAt(root));
  root = layout.projectRoot;
  const { statePath, uninstallPath, routingPath, journalStage } = layout;
  await assertBootstrapAuthority(root, layout);
  validateCommands(commands);
  const existing = await readAt(root, routingPath);
  if (existing !== undefined) {
    const journal = journalFrom(existing, layout),
      desired = manifestRoutes(journal.after, layout).commands;
    if (JSON.stringify(desired.map(key).sort()) !== JSON.stringify(commands.map(key).sort())) {
      throw new Error(
        `Routing recovery pending; run configure ${desired.join(' ')} or deinit --yes`,
      );
    }
    await applyJournal(root, journal, options, layout);
    return;
  }
  const plan = await planRoutes(root, commands, layout);
  if (equal(plan.before, plan.after)) {
    return;
  }
  const journal: RoutingJournal = {
    schema: 1,
    id: randomUUID(),
    before: plan.before,
    after: plan.after,
    additions: plan.additions,
  };
  const bytes = Buffer.from(JSON.stringify(journal, null, 2) + '\n');
  if ((await readAt(root, journalStage)) !== undefined) {
    throw new Error(
      `Unreferenced staging file: ${journalStage}; inspect and move it before retrying`,
    );
  }
  await stage(root, journalStage, bytes);
  const latest = await readAt(root, statePath);
  if (!latest || !equal(stateFrom(latest, layout), plan.before)) {
    throw new Error('Bootstrap changed before routing update');
  }
  if ((await readAt(root, uninstallPath)) !== undefined) {
    throw new Error('Uninstall started before routing update');
  }
  await publishExclusive(root, journalStage, routingPath, digest(bytes));
  await applyJournal(root, journal, options, layout);
}

export async function deinitialize(root: string, resolvedLayout?: ProjectLayout): Promise<void> {
  const layout = resolvedLayout ?? (await resolveProjectLayoutAt(root));
  root = layout.projectRoot;
  const { routingPath } = layout;
  await assertBootstrapAuthority(root, layout);
  const text = await readAt(root, routingPath);
  if (text) {
    await applyJournal(root, journalFrom(text, layout), {}, layout);
  }
  await uninstall(root, layout);
}
export async function addRoutes(root: string, commands: readonly string[]) {
  validateCommands(commands);
  const layout = await resolveProjectLayoutAt(root);
  const current = await configuredRoutes(root, layout);
  await reconcileRoutes(
    root,
    [
      ...current,
      ...commands.filter((command) => !current.some((old) => key(old) === key(command))),
    ],
    {},
    layout,
  );
}
export async function removeRoutes(root: string, commands: readonly string[]) {
  validateCommands(commands);
  const layout = await resolveProjectLayoutAt(root);
  const desired = (await configuredRoutes(root, layout)).filter(
    (old) => !commands.some((command) => key(command) === key(old)),
  );
  if (!desired.length) {
    throw new Error('Cannot remove the final route; use deinit --yes');
  }
  await reconcileRoutes(root, desired, {}, layout);
}
export async function configuredRoutes(root: string, layout?: ProjectLayout): Promise<string[]> {
  const status = await inspectInstallation(root, process.env, layout);
  if ('initialized' !== status.state) {
    throw new Error(`Cannot list/update routes: ${status.state}. ${status.warnings.join(' ')}`);
  }
  return status.routes;
}
