export class UsageError extends Error {}

export const help = `Arch project routing\nUsage:\n  arch init [commands...]\n  arch configure [commands...]\n  arch route list\n  arch route add <commands...>\n  arch route remove <commands...>\n  arch status [--json]\n  arch deinit [--yes]\n  arch uninstall [--yes]  (deprecated, prompt-free compatibility alias)\n  arch run <command> -- [args...]\n  arch --help\nBare init/configure require an interactive terminal. Explicit command sets never prompt.\nInstallation does not verify activation in the current shell.`;

export type ManagementRequest =
  | { operation: 'help' }
  | { operation: 'init' | 'configure'; commands: readonly string[] }
  | { operation: 'status'; json: boolean }
  | { operation: 'route-list' }
  | { operation: 'route-add' | 'route-remove'; commands: readonly string[] }
  | { operation: 'deinit' | 'uninstall'; yes: boolean };

function usage(message: string): never {
  throw new UsageError(`${message}\n${help}`);
}

// Terminal availability is an input, not a side effect of parsing. Run retains
// its separate historical syntax and exit-1 errors in the executable entrypoint.
export function parseManagement(
  args: readonly string[],
  interactive: boolean | undefined,
): ManagementRequest {
  const [operation, ...rest] = args;
  if ('--help' === operation && !rest.length) {
    return { operation: 'help' };
  }
  if ('init' === operation || 'configure' === operation) {
    if (rest.some((arg) => arg.startsWith('-'))) {
      usage('Unknown option');
    }
    if (!rest.length && !interactive) {
      usage(`Use ${operation} <commands...> outside an interactive terminal`);
    }
    return { operation, commands: rest };
  }
  if ('status' === operation) {
    if (rest.length && (1 !== rest.length || '--json' !== rest[0])) {
      usage('Expected status [--json]');
    }
    return { operation, json: '--json' === rest[0] };
  }
  if ('route' === operation) {
    const [action, ...commands] = rest;
    if ('list' === action && !commands.length) {
      return { operation: 'route-list' };
    }
    if (!commands.length || commands.some((command) => command.startsWith('-'))) {
      usage('Expected route list | route add/remove <commands...>');
    }
    if ('add' === action) {
      return { operation: 'route-add', commands };
    }
    if ('remove' === action) {
      return { operation: 'route-remove', commands };
    }
    usage('Unknown route operation');
  }
  if ('deinit' === operation || 'uninstall' === operation) {
    if (rest.length && (1 !== rest.length || '--yes' !== rest[0])) {
      usage('Expected deinit/uninstall [--yes]');
    }
    if ('deinit' === operation && !rest.length && !interactive) {
      usage('Removal requires deinit --yes outside an interactive terminal');
    }
    return { operation, yes: 0 !== rest.length };
  }
  usage('Unknown command');
}
