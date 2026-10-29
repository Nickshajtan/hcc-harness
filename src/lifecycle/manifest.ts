import { createHash } from 'node:crypto';
export const routePath = '.config/mise/conf.d/arch.toml';
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

export function stateFrom(text: Buffer): State {
  const state: unknown = JSON.parse(text.toString());
  if (!isOwnershipState(state)) {
    throw new Error('Invalid bootstrap state');
  }
  return state;
}
function isOwnershipState(state: unknown): state is State {
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
        !(file === routePath || /^\.arch\/bin\/(?!\.{1,2}$)[a-zA-Z0-9_.-]+$/.test(file)) ||
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

export function manifestRoutes(state: State): { commands: string[]; windows: boolean } {
  const paths = Object.keys(state.files);
  if (!state.files[routePath] || !state.files[markerPath]) {
    throw new Error('Incomplete routing manifest: missing mise integration or router marker');
  }
  const launchers = paths.filter((path) => path !== routePath && path !== markerPath);
  const windows = launchers.some((path) => /\.(exe|shim)$/.test(path));
  const commands = launchers
    .filter((path) => !windows || path.endsWith('.exe'))
    .map((path) => path.slice('.arch/bin/'.length).replace(windows ? /\.exe$/ : /$/, ''));
  validateCommands(commands, windows);
  // Validate case identity using the installation layout even on a foreign host.
  if (windows && new Set(commands.map((c) => c.toLowerCase())).size !== commands.length) {
    throw new Error('Duplicate Windows routes');
  }
  const expected = commands.flatMap((command) =>
    windows ? [`.arch/bin/${command}.exe`, `.arch/bin/${command}.shim`] : [`.arch/bin/${command}`],
  );
  if (expected.length !== launchers.length || expected.some((path) => !state.files[path])) {
    throw new Error('Incomplete routing manifest: invalid launcher set or missing exe/shim pair');
  }
  return { commands, windows };
}

export const configText = 'schema = 1\n\n[[middleware]]\nid = "demo"\nenabled = true\n';
