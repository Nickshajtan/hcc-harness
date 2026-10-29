import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setup, uninstall } from '../setup.js';
import {
  statePath,
  uninstallPath,
  stateFrom,
  validateCommands,
  manifestRoutes,
  equal,
  key,
} from './manifest.js';
import { routingPath, journalStage, journalFrom, type RoutingJournal } from './routing-journal.js';
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
): Promise<void> {
  root = resolve(root);
  validateCommands(commands);
  const existing = await readAt(root, routingPath);
  if (existing !== undefined) {
    const journal = journalFrom(existing),
      desired = manifestRoutes(journal.after).commands;
    if (JSON.stringify(desired.map(key).sort()) !== JSON.stringify(commands.map(key).sort())) {
      throw new Error(
        `Routing recovery pending; run configure ${desired.join(' ')} or deinit --yes`,
      );
    }
    await applyJournal(root, journal, options);
    return;
  }
  const plan = await planRoutes(root, commands);
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
  if (!latest || !equal(stateFrom(latest), plan.before)) {
    throw new Error('Bootstrap changed before routing update');
  }
  if ((await readAt(root, uninstallPath)) !== undefined) {
    throw new Error('Uninstall started before routing update');
  }
  await publishExclusive(root, journalStage, routingPath);
  await applyJournal(root, journal, options);
}

export async function deinitialize(root: string): Promise<void> {
  root = resolve(root);
  const text = await readAt(root, routingPath);
  if (text) {
    await applyJournal(root, journalFrom(text), {});
  }
  await uninstall(root);
}
export async function addRoutes(root: string, commands: readonly string[]) {
  validateCommands(commands);
  const current = await configuredRoutes(root);
  await reconcileRoutes(root, [
    ...current,
    ...commands.filter((command) => !current.some((old) => key(old) === key(command))),
  ]);
}
export async function removeRoutes(root: string, commands: readonly string[]) {
  validateCommands(commands);
  const desired = (await configuredRoutes(root)).filter(
    (old) => !commands.some((command) => key(command) === key(old)),
  );
  if (!desired.length) {
    throw new Error('Cannot remove the final route; use deinit --yes');
  }
  await reconcileRoutes(root, desired);
}
export async function configuredRoutes(root: string): Promise<string[]> {
  const status = await inspectInstallation(root);
  if ('initialized' !== status.state) {
    throw new Error(`Cannot list/update routes: ${status.state}. ${status.warnings.join(' ')}`);
  }
  return status.routes;
}
