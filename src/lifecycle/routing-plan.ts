import { resolveProjectLayoutAt, type ProjectLayout } from '../project-layout.js';
import { assertBootstrapAuthority } from './setup-claim.js';
import { renderFiles } from '../installation/renderer.js';
import {
  stateFrom,
  validateCommands,
  manifestRoutes,
  key,
  digest,
  type State,
} from './manifest.js';
import { checkFiles } from './ownership.js';
import { readAt } from './routing-files.js';
export interface RoutingPlan {
  before: State;
  after: State;
  additions: Record<string, string>;
  removed: string[];
}
export async function planRoutes(
  root: string,
  commands: readonly string[],
  resolvedLayout?: ProjectLayout,
): Promise<RoutingPlan> {
  // This plan inspects the filesystem. It never publishes changes or rewrites retained launchers.
  const project = resolvedLayout ?? (await resolveProjectLayoutAt(root));
  root = project.projectRoot;
  const { statePath, uninstallPath, routingPath } = project;
  await assertBootstrapAuthority(root, project);
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
  const before = stateFrom(text, project),
    layout = manifestRoutes(before, project);
  if (layout.windows !== ('win32' === process.platform)) {
    throw new Error(
      'Foreign-platform installation; deinitialize on its original platform or inspect ownership before moving it',
    );
  }
  await checkFiles(root, before.files);
  const canonical = commands.map(
    (command) => layout.commands.find((old) => key(old) === key(command)) ?? command,
  );
  const generated = await renderFiles(canonical, project);
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
