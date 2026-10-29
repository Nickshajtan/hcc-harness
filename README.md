# Arch

Arch is a project-scoped harness around existing command-line tools. It runs local
middleware around one native process, preserving arguments, cwd, terminal streams,
exit codes and supported signals. It has no AI SDK, agent loop, credentials,
background service or remote telemetry.

| Status                   | Capability                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **CURRENT PRODUCTION**   | npm-linked `arch`; project-local routing, wizard, configuration discovery, status, ownership-checked updates/recovery and removal |
| **VERIFIED FEASIBILITY** | M2.2 B1 independent runtime bootstraps and real Node 24/22 isolation on Ubuntu, macOS and Windows                                 |
| **PLANNED / NOT TESTED** | M2.2 B2 stable installation and production portability; real AI CLI/TUI integration; Windows ARM64                                |

## Install the CLI

Requires Node **>=24.15.0 <25**. The repository pins Node 24.19.0 and mise
2026.10.11. With compatible Node already available:

```sh
npm run bootstrap
npm link
arch --help
```

Alternatively, install [mise](https://mise.jdx.dev/installing-mise.html) and run
`mise run bootstrap` before linking. The package remains private; nothing is
published. npm's executable directory must already be on PATH. On Windows, npm
creates `.cmd`/PowerShell shims; use `arch.cmd` if execution policy requires it.
Installation does not edit PATH, profiles or target project configuration.

Keep the original checkout and Node executable available: current generated routes
capture both absolute paths. Rebuild with `npm run build` after source changes.
The direct invocation also works: `node /absolute/path/to/arch/dist/cli.js --help`.
Switching Node/npm prefixes can hide the development link; it is not a stable install.

## Initialize a project

From the target project root:

```sh
arch init claude codex              # deterministic; no prompts
# Or run arch init in a terminal for the wizard.
arch status
mise exec -- claude --help          # explicit activation for this subprocess
```

Installing the CLI and initializing project routing are separate. `init` writes
owned launchers/state under `.arch/`, a starter `.arch/harness.toml`, and
`.config/mise/conf.d/arch.toml`. It preserves existing user files and native binaries.
Initialization does **not** verify parent-shell mise activation. To use ordinary
`claude`/`codex` commands, [activate mise](https://mise.jdx.dev/shell-setup.html),
trust the generated project configuration and refresh the shell prompt.

```sh
arch configure claude gemini        # replace desired routes without prompts
arch route list
arch route add aider
arch route remove codex
arch status --json
arch run claude -- --help
```

`arch configure` without names opens the terminal menu. Route changes never rewrite
middleware configuration. The nearest ancestor `.arch/harness.toml` controls an
execution; missing configuration passes through to the native executable.
See [usage and configuration](docs/usage.md) for examples and recovery instructions.

## Remove routing or the CLI link

```sh
arch deinit                        # terminal confirmation, default No
arch deinit --yes                  # deterministic unattended removal
npm unlink --global arch-harness   # use the original npm prefix
```

Deinit removes only verified owned resources and preserves edited/preexisting
middleware configuration. The deprecated `arch uninstall [--yes]` alias remains
prompt-free for compatibility. Unlinking removes the CLI link, not project routing;
deinitialize projects first or use a working direct Node invocation afterward.

## Limits and development

Route reconciliation requires hard links: exFAT is unsupported, and other mounts
may also lack support. There is no fallback publication algorithm. Updates are
recoverable checkpoints, not atomic route-set switches or power-loss guarantees.
Run only one project mutator at a time. See [compatibility](docs/compatibility.md).

Native Windows executables and supported npm `.cmd` shims work without a command
shell. Arbitrary batch scripts, shell functions/aliases and every third-party TUI
are outside the verified contract. Arch manages its direct child; force termination
cannot guarantee cleanup. RTK, provider adapters and runtime management are out of scope.

```sh
npm run check
npm run test:acceptance
npm run test:wizard
```

Tests need mise on PATH (or an absolute `MISE_BIN`). Windows fixtures need the .NET
Framework C# compiler. No AI CLI or credentials are used. The mandatory portability
CI provisions additional real runtimes; normal local tests skip those opt-in cases.

- [Architecture and ownership contracts](docs/architecture.md)
- [Usage, configuration and recovery](docs/usage.md)
- [Development, tests and CI evidence](docs/testing.md)
- [Platform and filesystem compatibility](docs/compatibility.md)
- [Active M2.2 design and B2 review gate](docs/runtime-portability.md)
- [Engineering standards and quality policy](docs/standards/README.md)
