import { resolve } from 'node:path';
import { renderFiles } from '../installation/renderer.js';
import {
  stateFrom,
  statePath,
  uninstallPath,
  validateCommands,
  manifestRoutes,
  key,
  digest,
  type State,
} from './manifest.js';
import { checkFiles } from './ownership.js';
import { routingPath } from './routing-journal.js';
import { readAt } from './routing-files.js';
export interface RoutingPlan {
  before: State;
  after: State;
  additions: Record<string, string>;
  removed: string[];
}
export async function planRoutes(root: string, commands: readonly string[]): Promise<RoutingPlan> {
  // This plan inspects the filesystem. It never publishes changes or rewrites retained launchers.
  root = resolve(root);
  validateCommands(commands);
  if (
    (await readAt(root, uninstallPath)) !== undefined ||
    (await readAt(root, routingPath)) !== undefined
  ) {
    throw new Error('Recovery pending; finish the recorded operation first');
  }
  const text = await readAt(root, statePath);
  if (!text) {
    throw new Error('Arch is not initialized; use init <commands...>');
  }
  const before = stateFrom(text),
    layout = manifestRoutes(before);
  if (layout.windows !== ('win32' === process.platform)) {
    throw new Error(
      'Foreign-platform installation; deinitialize on its original platform or inspect ownership before moving it',
    );
  }
  await checkFiles(root, before.files);
  const canonical = commands.map(
    (command) => layout.commands.find((old) => key(old) === key(command)) ?? command,
  );
  const generated = await renderFiles(canonical);
  const after: State = { files: {}, createdHarness: before.createdHarness },
    additions: Record<string, string> = {};
  for (const [path, bytes] of generated) {
    after.files[path] = before.files[path] ?? digest(bytes);
    if (!before.files[path]) {
      if ((await readAt(root, path)) !== undefined) {
        throw new Error(`Refusing to overwrite ${path}`);
      }
      additions[path] = Buffer.from(bytes).toString('base64');
    }
  }
  return {
    before,
    after,
    additions,
    removed: Object.keys(before.files).filter((path) => !after.files[path]),
  };
}
