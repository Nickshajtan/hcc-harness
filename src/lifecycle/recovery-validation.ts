import { statePath, uninstallPath, stateFrom, equal, digest, encode } from './manifest.js';
import { journalStage, type RoutingJournal } from './routing-journal.js';
import { readAt, verifyStage, staging } from './routing-files.js';
// Validation authorizes only states explicitly represented by the recorded before/after plan.
export async function validateRecovery(root: string, journal: RoutingJournal) {
  if ((await readAt(root, uninstallPath)) !== undefined) {
    throw new Error('Conflicting routing and uninstall journals');
  }
  const bootstrap = await readAt(root, statePath);
  if (!bootstrap) {
    throw new Error('Missing bootstrap during routing recovery');
  }
  const current = stateFrom(bootstrap);
  if (!equal(current, journal.before) && !equal(current, journal.after)) {
    throw new Error('Bootstrap changed during routing recovery');
  }
  for (const path of new Set([
    ...Object.keys(journal.before.files),
    ...Object.keys(journal.after.files),
  ])) {
    const bytes = await readAt(root, path);
    const retained = !!journal.before.files[path] && !!journal.after.files[path];
    if (bytes === undefined && !retained) {
      continue;
    }
    if (
      bytes === undefined ||
      digest(bytes) !== (journal.after.files[path] ?? journal.before.files[path])
    ) {
      throw new Error(`Managed file changed during routing recovery: ${path}`);
    }
  }
  await verifyStage(root, journalStage, Buffer.from(JSON.stringify(journal, null, 2) + '\n'));
  for (const [index, payload] of Object.values(journal.additions).entries()) {
    await verifyStage(root, staging(journal, index), Buffer.from(payload, 'base64'));
  }
  await verifyStage(root, staging(journal, 'manifest'), Buffer.from(encode(journal.after)));
}
