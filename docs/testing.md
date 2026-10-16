# Testing

## Commands

Prerequisites: Node 24.15+ (24.x), dependencies installed, and mise 2026.10.11 on PATH.
Set `MISE_BIN` to an absolute executable path when using a local mise download.
The Windows test fixture compiler is `%SystemRoot%/Microsoft.NET/Framework64/v4.0.30319/csc.exe`.

```sh
mise run bootstrap
npm run check
```

Individual checks:

```sh
npm run typecheck
npm run lint
npm run build
npm run experiment
npm run test:unit
npm run test:integration
npm run test:acceptance
```

Run `build` before individual integration tests after changing production code.
`test:acceptance` builds automatically. `check` runs all checks and suites.
The network is needed to install packages/tools; tests make no provider calls and
run mise offline. No actual Claude/Codex installation or credentials are used.

## Fixtures and assertions

`tests/support.ts` creates isolated temporary HOME, USERPROFILE, mise config/data/
cache and PATH. A/B/C are adjacent projects. Windows uses compiled C# native `.exe`
fixtures; POSIX uses executable Node fixtures. A/B launchers precede fake native
executables so tests exercise the real dispatcher through plain `claude`/`codex`,
including stale PATH while switching projects. A separate integration assertion
uses actual mise PATH activation without prepopulating the launcher directories.
Fixtures record launch count, exact arguments, cwd, PID and the demo preparation
variable. Stdio, input, and exit codes are asserted independently.

Unit tests cover strict TOML validation, ancestor/nested discovery, registry errors,
configuration order, immutable context, launch API validation/conflicts, denial,
all-attempted finalization, LIFO cleanup, concurrent isolated state, event types and
correlation, awaited delivery, unsubscribe, listener disposal, and subscriber/reporter
exceptions. Failed registration cleans already-acquired resources.

The black-box test initializes A and B, runs ordinary command names, checks demo
and lifecycle events, proves exactly one native launch with original arguments/cwd,
switches through B and unconfigured C/outside, returns to A and denies launch,
checks failure and cleanup, and repeats with parallel success/passthrough/denial.
It also checks subdirectories, uninstall, B's continued operation and unchanged
native binary content. Every expected result is asserted programmatically.

The feasibility suite is a separate measurement of the rejected mise-wrapper
approach. It saves JSON evidence under `.test-state/`; a recorded missing native
fallback in this experiment is the reason for the selected dispatcher, not an
allowed failure in the acceptance suite.

Console tests are platform-specific by design. POSIX tests send SIGINT/SIGTERM to
the CLI and assert cleanup. Windows tests create a hidden, separate console using
WinAPI, run the actual native Arch launcher, wait for recorded native startup,
generate Ctrl+C/Ctrl+Break, and assert cleanup and no surviving direct child.
They do not simulate a console event with `process.kill()` on Windows. That API
force-terminates processes and cannot validate graceful cleanup.

## Corrective regression coverage

The unit suite now deterministically injects startup aborts, repeated cancellation,
child exit/error races, synchronous termination failures and fake-timer escalation.
It also injects uninstall deletion failures and simulates interruption at the
ownership-checkpoint boundary, then proves retry. Environment identity assertions
select the host platform's case rules; observer setup/reporter failures and rejected
promises are contained. Resolver tests use real files under misleading directory
names and verify PATH order and Arch marker identity.

The integration suite resumes an interrupted uninstall through the actual CLI and
proves native routing returns. On POSIX, a real fixture acknowledges and ignores
SIGTERM, exercising the forced-kill fallback. Readiness is signalled through output,
not a timed startup sleep. Each fixture root declares CommonJS so extensionless
fake Node tools cannot inherit the repository's ESM package scope.

## CI and verification status

`.github/workflows/ci.yml` runs type checking, linting, build, routing experiments,
unit, integration, and black-box acceptance suites on `ubuntu-latest`,
`macos-latest`, and `windows-latest`. It pins mise 2026.10.11 and Node 24.19.0,
uses the dependency lockfile, and uploads routing experiment evidence.

Local verification: native Windows x64, Node 24.19.0, mise 2026.10.11. Both the
Node-only bootstrap and the exact mise bootstrap task succeeded with clean
lockfile installs; mise downloaded and activated a fresh Node installation in
isolated project-local state. On this machine mise warned that optional version
alias symlinks could not be created; the managed Node and task still succeeded.
The corrective local `npm run check` passed all checks and ten test files:
62 passed, three platform-specific skips, zero failures. See the
[corrective report](corrective-implementation-report.md) for current hosted matrix
results and the [initial report](implementation-report.md) for historical results.
Skipped POSIX signal tests on Windows are complemented by real Windows console
tests. Windows ARM64 remains unverified. Cross-platform completion requires the
corrected hosted matrix to pass.

## Manual interactive smoke test

1. Activate mise in a fresh terminal. Initialize two scratch projects with different
   middleware lists; keep a third unconfigured. Trust the generated project config.
2. Run an available interactive native tool by its plain name in each project and
   a subdirectory. Confirm prompt input, terminal resize, colors and cursor behavior.
3. Switch directories repeatedly and check no middleware configuration carries over.
4. Enable local trace, interrupt a running command using Ctrl+C (also Ctrl+Break on
   Windows), and confirm cleanup before the next shell prompt.
5. Uninstall one project and confirm native commands and the other project still work.

These manual TTY/TUI checks have not been performed against installed AI CLIs.
