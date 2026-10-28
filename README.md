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

Install the command using npm's standard local-development link (keep this checkout):

```sh
npm link
arch --help
```

This links `arch` to the existing `dist/cli.js`; it does not publish the private
package. Your npm global executable directory must already be on PATH. On Windows,
npm supplies command/PowerShell shims; PowerShell execution policy may require using
`arch.cmd`. Installation does not edit PATH, shell profiles, or target project
configuration. Rebuild with `npm run build` after changing the source.

From a target project's root, run `arch init`.
In a terminal, bare `init` opens a wizard with detected CLI suggestions and custom
command entry. Discovery never executes tools or reads credentials. Choose routes,
review the summary, and confirm; cancellation changes no files. Outside a terminal,
supply names explicitly: `arch init claude codex`.

Initialization installs project routing resources; **it does not verify shell
activation**. Activate mise, refresh the shell prompt, and trust the project
configuration when mise asks. Then use ordinary commands:

```sh
claude --help
codex --help
```

For a script, CI, or an unactivated shell, use `mise exec -- claude --help`.
To route other executable names, supply them explicitly at initialization:
`arch init mytool another-tool`.

Installing the CLI and initializing project routing are separate operations.
`arch init` does not install the global command. The original invocation remains
available without a link: `node /absolute/path/to/arch/dist/cli.js --help` (for
example `node D:/AI/projects/projects/harness/dist/cli.js --help` on Windows).

To remove the global development link, run `npm unlink --global arch-harness`
using the same npm prefix used for installation. This removes the `arch` command
link; it does not deinitialize projects. Project launchers retain absolute paths
to this checkout and its Node runtime, so both must remain available even after
unlinking. Use `arch deinit` before unlinking, or the direct Node invocation later,
to remove project routing. No project-local `npm link arch-harness` is needed.

Arch writes only `.arch/harness.toml`, owned bootstrap state/launchers under `.arch/`,
and `.config/mise/conf.d/arch.toml` for project PATH activation. Existing files and
native binaries are preserved. Repeating initialization with the same commands
validates the recorded managed files and makes no changes. To change routes, use
`configure` or `route` below. Modified managed files produce an explicit error. Keep this Arch
checkout and its Node installation at the captured paths; uninstall/reinitialize
projects when moving them. Do not commit generated absolute-path launchers/state.

## Routing and inspection

After `npm link`, use the installed `arch` command:

```sh
arch configure                     # interactive routing menu
arch configure claude gemini       # replace the desired route set without prompts
arch route list                    # configured commands, one per line
arch route add aider               # retain other routes; idempotent
arch route remove codex            # retain Arch and other routes
arch status
arch status --json
arch --help
arch run claude -- --help          # explicit harness execution
```

The wizard manages routes, not middleware settings. Route changes never rewrite
`.arch/harness.toml`. Removing the last route is refused; use `deinit` instead.
Known CLI tools are suggestions, and missing/custom executables may be configured
before they are installed. Names must start with a letter and contain only letters,
digits, `_` or `-`; `arch`, `node`, and `mise` are reserved. Windows route identity
is case-insensitive.

Status separates installation health from activation observations. `initialized`
means owned files are valid on disk. Mise availability or project-bin presence in
PATH does not prove that parent-shell hooks, trust, aliases, or functions resolve
commands through Arch. JSON reports `activation.shellActivation: "unknown"` and
the individual observations. `mise exec -- <command>` explicitly activates routing
for that subprocess. Installation succeeds even when mise is absent.

Routing changes require hard-link support. exFAT is consciously unsupported for
M2 reconciliation; other filesystems or mounts may also lack this capability.
Use a hard-link-capable local filesystem such as NTFS, APFS, or ext4 where supported
and configured appropriately. Arch attempts the operation rather than guessing
support from volume names or OS. No alternative publication fallback is used.
Initial M1-style setup and deinitialization without pending routing recovery do
not inherently require hard links. Recovery of a pending routing update may require
them, including when requested by deinit. See [filesystem compatibility](docs/filesystem-compatibility.md).
A journal plus complete staged files allows safe retry after interruption.
`status` describes a pending update; resume using `configure` with its recorded
desired names, or remove using `deinit --yes`. Different desired updates are blocked
until recovery finishes. Run only one setup/routing/removal operation per project
at a time; the journals detect conflicting operations, not every filesystem race.

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

## Deinitialize

From the initialized project's root:

```sh
arch deinit
# Unattended/scripted removal:
arch deinit --yes
```

Interactive `deinit` displays a plan and defaults to No. Outside a terminal it
requires `--yes`. The deprecated `uninstall` alias preserves M1's prompt-free
behavior, including scripts and recovery; it emits a deprecation notice on stderr.
Both use the same ownership checks. Refresh the shell prompt after removal.
Removal deletes only matching managed files. It removes
the starter harness configuration only if it created that file and it is unchanged;
edited or preexisting harness configurations remain. It leaves unrelated files and
other projects alone. Before deleting files, uninstall atomically renames the
ownership manifest to `.arch/uninstall.json`. If interrupted or denied a deletion,
run the same uninstall command again; it verifies remaining files and resumes.
Only this checkpoint permits already-removed managed files. Modified remaining
files still block removal. The checkpoint is deleted last. Initialization is
refused while recovery is pending. Repeated uninstall is safe. Empty directories
may remain.

Routing recovery uses `.arch/routing.json`. Unexpected or modified remaining bytes
block recovery; Arch never guesses ownership or deletes unrelated files. A partial
private staging write is preserved and diagnosed with its exact path; restore its
journal-recorded bytes before retrying. An orphan `.arch/routing.stage` from an
interruption before journal publication must be inspected and moved aside manually.
Fresh initialization retains M1's caught-error rollback; force termination before
its bootstrap is published may leave files requiring manual ownership inspection.
These operations provide recoverable checkpoints, not a fully atomic route-set
switch or power-loss durability guarantee. Windows exe/shim pairs can be partially
published at interruption; recorded recovery completes them.

## Tests

```sh
npm run check
npm run test:acceptance
npm run test:wizard
```

`check` runs type checking, linting, a build, and every test. The second command
builds and runs the complete A/B/C black-box acceptance scenario, including
concurrency, denial, passthrough and uninstall. Tests require mise on PATH, or
`MISE_BIN` set to its absolute path. Native Windows fixture compilation uses the
OS-provided .NET Framework C# compiler; production does not require that compiler.
See [testing](docs/testing.md) for platform results and [architecture](docs/architecture.md)
for the routing experiment and contracts.

The separate [Wizard checks workflow](.github/workflows/wizard.yml) runs focused
unit tests and real-terminal CLI scenarios on Ubuntu, macOS and Windows. It supports
manual dispatch, publishes a scenario summary, and uploads terminal transcripts.
See [wizard workflow](docs/wizard-workflow.md) for coverage and local use.

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

- M1's local/hosted validation used Node 24.19.0 and mise 2026.10.11. M2 validation
  and remaining platform/TTY limitations are recorded separately in the
  [M2 implementation report](docs/m2-implementation-report.md). Windows ARM64 remains unverified.
- Native Windows `.exe`/`.com` and npm `.cmd` shims targeting Node scripts or native
  executables are supported. Arbitrary batch scripts and custom shell functions/
  aliases are outside the executable contract and must be invoked explicitly.
- Arch inherits terminal descriptors. Automated stdio and console interruption tests
  do not substitute for manual smoke tests of every interactive CLI/TUI.
- Windows force termination (`taskkill /F`, Task Manager) cannot run cleanup. On
  supported console signals Arch manages its direct child, with a 3-second hard-kill
  fallback on POSIX. Descendant processes remain the native tool's responsibility.
- Exact corrective test results and runner evidence are recorded in the
  [corrective implementation report](docs/corrective-implementation-report.md).

RTK, MCP/skills/context management, provider routing, budgets, DLP, sandboxing,
sessions, remote transports, and agent orchestration are deferred. No placeholders
for them are included.
