# Arch

A small, project-scoped execution harness for existing command-line tools. Arch composes
local middleware around one native process execution. It has no AI SDK, agent loop,
server, credentials, background service, or remote telemetry.

## Install

Install [mise](https://mise.jdx.dev/installing-mise.html) 2026.10.11 or newer and
[activate it in your shell](https://mise.jdx.dev/shell-setup.html). In this checkout:

```sh
mise run bootstrap
```

This selects Node 24.19.0, runs `npm ci`, and builds `dist/`. Nothing installs merely
because the repository was cloned. Alternatively, with Node 24.15+ (24.x):
`npm run bootstrap`.

From a target project's root, run this command with the actual absolute checkout path:

```sh
node /absolute/path/to/arch/dist/cli.js init
```

On Windows, for example: `node D:/AI/projects/projects/harness/dist/cli.js init`.
Refresh the shell prompt after initialization and trust the project configuration
when mise asks. Then use ordinary commands:

```sh
claude --help
codex --help
```

For a script, CI, or an unactivated shell, use `mise exec -- claude --help`.
To route other executable names, supply them explicitly at initialization:
`node /absolute/path/to/arch/dist/cli.js init mytool another-tool`.

Arch writes only `.arch/harness.toml`, owned bootstrap state/launchers under `.arch/`,
and `.config/mise/conf.d/arch.toml` for project PATH activation. Existing files and
native binaries are preserved. Repeating initialization with the same installation
and commands validates the managed files and makes no changes. Different setup
arguments or modified managed files produce an explicit error. Keep this Arch
checkout and its Node installation at the captured paths; uninstall/reinitialize
projects when moving them. Do not commit generated absolute-path launchers/state.

## Configuration

```toml
schema = 1

[[middleware]]
id = "demo"
enabled = true
```

The nearest ancestor `.arch/harness.toml` wins, including within subdirectories.
Nested configurations replace the entire parent configuration. Adjacent projects
are independent. A missing configuration runs the native executable; an invalid
configuration or unknown enabled middleware fails explicitly. List order is
execution order. An empty middleware list still activates the lifecycle.

Set `ARCH_TRACE=1` in your shell for local lifecycle JSON and demo diagnostics on
stderr. No arguments or environment dumps appear in events. `ARCH_DEMO_DENY=1`
makes the demonstration middleware deny execution for deterministic tests.

## Uninstall

From the initialized project's root:

```sh
node /absolute/path/to/arch/dist/cli.js uninstall
```

Refresh the shell prompt. Uninstall removes only matching managed files. It removes
the starter harness configuration only if it created that file and it is unchanged;
edited or preexisting harness configurations remain. It leaves unrelated files and
other projects alone. Repeated uninstall is safe. Empty directories may remain.

## Tests

```sh
npm run check
npm run test:acceptance
```

`check` runs type checking, linting, a build, and every test. The second command
builds and runs the complete A/B/C black-box acceptance scenario, including
concurrency, denial, passthrough and uninstall. Tests require mise on PATH, or
`MISE_BIN` set to its absolute path. Native Windows fixture compilation uses the
OS-provided .NET Framework C# compiler; production does not require that compiler.
See [testing](docs/testing.md) for platform results and [architecture](docs/architecture.md)
for the routing experiment and contracts.

## Registering middleware

Implement the same contract as `src/demo.ts` and add an explicit local factory to
`defaultRegistry` in `src/core.ts`. No routing or lifecycle edits are needed.

```ts
import type { ArchMiddleware } from './middleware.js';

export function example(): ArchMiddleware {
  return { id: 'example', register(api) {
    api.on('preflight', () => { api.context.signal.throwIfAborted(); });
    api.on('prepareLaunch', () => { api.setEnv('MY_TOOL_MODE', 'local'); });
    api.cleanup(() => { /* release resources acquired by this module */ });
  } };
}
```

Add `['example', example]` to the registry, build, and enable `example` in TOML.
Factories create execution-local state. Middleware is trusted local code, not a
sandbox. Programmatic consumers can pass a separate registry and observe the
per-execution event bus through `execute()`.

## Limits

- Local verification is native Windows x64 with Node 24.19.0 and mise 2026.10.11.
  Ubuntu/macOS CI is configured but has not run in this session; ARM64 is unverified.
- Native Windows `.exe`/`.com` and npm `.cmd` shims targeting Node scripts or native
  executables are supported. Arbitrary batch scripts and custom shell functions/
  aliases are outside the executable contract and must be invoked explicitly.
- Arch inherits terminal descriptors. Automated stdio and console interruption tests
  do not substitute for manual smoke tests of every interactive CLI/TUI.
- Windows force termination (`taskkill /F`, Task Manager) cannot run cleanup. On
  supported console signals Arch manages its direct child, with a 3-second hard-kill
  fallback on POSIX. Descendant processes remain the native tool's responsibility.
- No cross-platform MVP completion is claimed until the CI matrix is green.

RTK, MCP/skills/context management, provider routing, budgets, DLP, sandboxing,
sessions, remote transports, and agent orchestration are deferred. No placeholders
for them are included.
