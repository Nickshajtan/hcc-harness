# Testing

For first-class npm CLI installation/linking, unsupported hard-link capability
regressions, and current three-platform evidence, see the
[M2.1 implementation report](m2.1-implementation-report.md) and
[filesystem compatibility](filesystem-compatibility.md). Npm link/unlink tests use
an isolated temporary prefix and never modify the user's global installation.

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
npm run test:wizard
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
63 passed, three platform-specific skips, zero failures. See the
[corrective report](corrective-implementation-report.md) for current hosted matrix
results and the [initial report](implementation-report.md) for historical results.
Skipped POSIX signal tests on Windows are complemented by real Windows console
tests. Windows ARM64 remains unverified. Cross-platform completion requires the
corrected hosted matrix to pass.

The final corrective code commit `bb35dab` passed the complete
[hosted matrix](https://github.com/Nickshajtan/hcc-harness/actions/runs/38829564913).
Ubuntu and macOS each ran 64 passing tests with two Windows-only skips. Native
Windows ran 63 passing tests with three POSIX-only skips. All matrix type checking,
linting and builds passed. The corrective report records per-suite counts.

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

## M2 lifecycle coverage and evidence

`m1-compatibility.test.ts` uses the frozen pre-M2 generator in
`tests/fixtures/m1-setup.ts` (provenance in `tests/fixtures/M1.md`). It first passed
against the original ownership format before stricter routing checks were added.
Each CI host generates its native M1 layout and tests M2 reading, reordered keys,
captured old paths, ownership flags, missing/edited configuration and uninstall
checkpoints. No fixture snapshot contains a machine-specific path.

`lifecycle.test.ts` unit tests planning, validation, states, collisions, symlinks,
hash/payload refusal, hard-link errors, checkpoint retries, manifest replacement
errors, config/native preservation and installation independent of activation.
Discovery never launches its invalid executable fixtures. Wizard tests inject
terminal responses for defaults, custom names, duplicate/reserved rejection,
EOF/cancel/default-No and configuration/removal operations.

`tests/integration/lifecycle.test.ts` builds on real dispatcher/native fixtures.
An IPC worker calls the public reconciliation service and acknowledges a persisted
checkpoint, then waits. The parent forcibly terminates it, inspects the pending
journal through the real CLI, invokes a retained route, and resumes through
`configure <commands...>`. Checkpoints include journal publication, complete staging,
launcher publication, Windows exe/shim separation, removal, before/after bootstrap
replacement and cleanup. The publication test checks hard-link count and complete
bytes, and the resumed new route must launch exactly once. Production has no
test-only environment hooks. The optional programmatic checkpoint observer is
awaited so deterministic interruption can happen at an actual boundary.

M2 routing tests use the OS temporary directory: this checkout's D: volume is
exFAT, while Windows temporary storage supports hard links. Unsupported filesystems
are tested as a failure before any live route changes. Tests do not silently skip
hard-link publication; CI must run them on its supported local filesystem.

The existing Ubuntu/macOS/native-Windows matrix runs all new tests. Its JSON
Vitest reports are uploaded per platform alongside historical routing experiment
evidence. [M2's report](m2-implementation-report.md) is the source for actual run
links and PASS/FAIL/NOT TESTED results; historical M1 CI links do not validate M2.

Extend the manual checklist above:

1. Run bare init in a real terminal; inspect installed/missing suggestions, enter a
   custom name, reject duplicates, and cancel at both selection and final summary.
2. Complete init, and confirm the output distinguishes installation from activation.
   Test a fresh unactivated shell separately from mise-exec routing.
3. Use configure to inspect, change routes, cancel, and remove with default No.
   Test Ctrl+C and EOF during input without filesystem changes.
4. Run `deinit` and decline, then accept. Confirm prompt refresh restores native
   command resolution and another project's routes are unaffected.

The M2 implementation session performed a native Windows PTY walkthrough of custom
init, validation, confirmation, configure, default-No/accepted deinit, and Ctrl+C
without writes. This establishes that tested Arch interaction only. Installed AI
CLI TUI compatibility and refreshed parent-shell activation remain NOT TESTED.

The dedicated [Wizard checks workflow](../.github/workflows/wizard.yml) automates
actual CLI interaction in POSIX PTYs and native Windows ConPTY, including Ctrl+C,
EOF, confirmation and cancellation. Its [workflow guide](wizard-workflow.md)
documents the 13 terminal scenarios, focused unit suite and per-platform transcripts.
It runs separately from the general matrix; `npm run check` retains its existing
test scope, while `npm run test:wizard` additionally runs the native PTY checks.
