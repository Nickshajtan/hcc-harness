import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { statePath, digest, encode } from './manifest.js';
import { checkFiles } from './ownership.js';
import { journalStage, routingPath, type RoutingJournal } from './routing-journal.js';
import {
  readAt,
  staging,
  verifyStage,
  stage,
  removeOptional,
  publishExclusive,
} from './routing-files.js';
import { validateRecovery } from './recovery-validation.js';
export interface LifecycleOptions {
  checkpoint?: (phase: string) => void | Promise<void>;
}

export async function applyJournal(
  root: string,
  journal: RoutingJournal,
  options: LifecycleOptions,
) {
  // Keep this effect order explicit: validate, publish additions, remove old routes,
  // replace owned metadata, verify/clean stages, then remove the recovery authority last.
  await validateRecovery(root, journal);
  await options.checkpoint?.('journal');
  for (const [index, [path, payload]] of Object.entries(journal.additions).entries()) {
    const bytes = Buffer.from(payload, 'base64'),
      temporary = staging(journal, index);
    await stage(root, temporary, bytes, true);
    await options.checkpoint?.(`staged:${path}`);
    if ((await readAt(root, path)) === undefined) {
      // link is exclusive: unlike rename, it never replaces a destination collision.
      await publishExclusive(root, temporary, path);
    }
    await options.checkpoint?.(`published:${path}`);
  }
  await checkFiles(root, journal.after.files);
  // All desired routes must exist before the first obsolete route is removed.
  for (const path of Object.keys(journal.before.files).filter(
    (path) => !journal.after.files[path],
  )) {
    const bytes = await readAt(root, path);
    if (bytes !== undefined && digest(bytes) !== journal.before.files[path]) {
      throw new Error(`Managed file changed: ${path}`);
    }
    await removeOptional(root, path);
    await options.checkpoint?.(`removed:${path}`);
  }
  const temporary = staging(journal, 'manifest');
  await stage(root, temporary, Buffer.from(encode(journal.after)));
  await validateRecovery(root, journal);
  await options.checkpoint?.('before-manifest');
  // Same-directory replacement. Sharing failures retain both checkpoint and stage.
  await rename(join(root, temporary), join(root, statePath));
  await options.checkpoint?.('manifest');
  await checkFiles(root, journal.after.files);
  for (const [index, payload] of Object.values(journal.additions).entries()) {
    const path = staging(journal, index);
    await verifyStage(root, path, Buffer.from(payload, 'base64'));
    await removeOptional(root, path);
  }
  await verifyStage(root, journalStage, Buffer.from(JSON.stringify(journal, null, 2) + '\n'));
  await removeOptional(root, journalStage);
  await options.checkpoint?.('cleanup');
  await removeOptional(root, routingPath);
}
