import { projectLayout, type ProjectLayout } from '../project-layout.js';
import { createHash } from 'node:crypto';
export const routePath = '.config/mise/conf.d/arch.toml';
// Compatibility exports describe the default home; effects use an explicit layout.
export const statePath = '.arch/bootstrap.json';
export const uninstallPath = '.arch/uninstall.json';
export interface State {
  files: Record<string, string>;
  createdHarness: boolean;
}
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const markerPath = '.arch/bin/.arch-router';
export const encode = (state: State) => JSON.stringify(state, null, 2) + '\n';
export const equal = (a: State, b: State) =>
  a.createdHarness === b.createdHarness &&
  JSON.stringify(Object.entries(a.files).sort()) === JSON.stringify(Object.entries(b.files).sort());
export const key = (name: string) => ('win32' === process.platform ? name.toLowerCase() : name);

export function stateFrom(text: Buffer, layout: ProjectLayout = projectLayout('.')): State {
  const state: unknown = JSON.parse(text.toString());
  if (!isOwnershipState(state, layout)) {
    throw new Error('Invalid bootstrap state');
  }
  return state;
}
function isOwnershipState(state: unknown, layout: ProjectLayout): state is State {
  if (
    null === state ||
    'object' !== typeof state ||
    Array.isArray(state) ||
    !('files' in state) ||
    null === state.files ||
    'object' !== typeof state.files ||
    Array.isArray(state.files) ||
    !('createdHarness' in state) ||
    'boolean' !== typeof state.createdHarness ||
    Object.entries(state.files).some(
      ([file, hash]: [string, unknown]) =>
        !(
          file === routePath ||
          (file.startsWith(`${layout.binDirectory}/`) &&
            /^(?!\.{1,2}$)[a-zA-Z0-9_.-]+$/.test(file.slice(layout.binDirectory.length + 1)))
        ) ||
        'string' !== typeof hash ||
        !/^[a-f0-9]{64}$/.test(hash),
    )
  ) {
    return false;
  }
  return true;
}
export function validateCommands(
  commands: readonly string[],
  windows = 'win32' === process.platform,
): void {
  if (
    !commands.length ||
    new Set(commands.map((c) => (windows ? c.toLowerCase() : c))).size !== commands.length ||
    commands.some(
      (c) =>
        !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c) || ['node', 'mise', 'arch'].includes(c.toLowerCase()),
    )
  ) {
    throw new Error('Supply unique executable names (node, mise, and arch are reserved)');
  }
}

export function manifestRoutes(
  state: State,
  layout: ProjectLayout = projectLayout('.'),
): { commands: string[]; windows: boolean } {
  const { markerPath, binDirectory } = layout;
  const paths = Object.keys(state.files);
  if (!state.files[routePath] || !state.files[markerPath]) {
    throw new Error('Incomplete routing manifest: missing mise integration or router marker');
  }
  const launchers = paths.filter((path) => path !== routePath && path !== markerPath);
  const windows = launchers.some((path) => /\.(exe|shim)$/.test(path));
  const commands = launchers
    .filter((path) => !windows || path.endsWith('.exe'))
    .map((path) => path.slice(binDirectory.length + 1).replace(windows ? /\.exe$/ : /$/, ''));
  validateCommands(commands, windows);
  // Validate case identity using the installation layout even on a foreign host.
  if (windows && new Set(commands.map((c) => c.toLowerCase())).size !== commands.length) {
    throw new Error('Duplicate Windows routes');
  }
  const expected = commands.flatMap((command) =>
    windows
      ? [`${binDirectory}/${command}.exe`, `${binDirectory}/${command}.shim`]
      : [`${binDirectory}/${command}`],
  );
  if (expected.length !== launchers.length || expected.some((path) => !state.files[path])) {
    throw new Error('Incomplete routing manifest: invalid launcher set or missing exe/shim pair');
  }
  return { commands, windows };
}

export const legacyConfigText = 'schema = 1\n\n[[middleware]]\nid = "demo"\nenabled = true\n';
export const configText = 'schema = 1\nmiddleware = []\n';
