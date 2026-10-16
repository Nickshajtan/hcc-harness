# P1/P2 corrective implementation report

## Summary and finding resolution

This maintenance change preserves the three lifecycle phases, middleware API,
project configuration, event types/envelopes, and provider-independent routing.
No dependencies or product subsystems were added.

| Finding | Classification | Evidence and correction |
|---|---|---|
| P1 cancellation races | **Fixed — reproduced and corrected** | Injecting abort during listener installation caused two termination requests and redundant timers. Retained callback invocation caused repeated kills; completed/error paths retained child listeners; a child already exited during initialization could hang. Separate cancellation/settlement guards now enforce one cancellation, at most one escalation timer, startup rechecks, exited-child checks, and complete listener/timer disposal. |
| P1 uninstall recovery | **Fixed — reproduced and corrected** | Injected deletion failure left the original manifest referencing a deleted routing file, preventing retry. Uninstall now validates ownership, atomically renames that complete manifest to `.arch/uninstall.json`, and removes it only after all cleanup succeeds. Only a validated recovery checkpoint allows absent managed files; remaining modified files still fail. Init refuses pending recovery, and errors name the operation/path. |
| P2 environment conflict lookup | **Not reproduced — failure not demonstrated** | Existing `setEnv()` uses the same canonical `key` for lookup and storage. New tests pass unchanged on Windows for mixed-case identical/conflicting values, validation, phase restrictions and concurrent isolation. No working middleware code was changed. POSIX assertions retain case-sensitive identity. |
| P2 observer initialization diagnostics | **Fixed — reproduced and corrected** | Initialization exceptions reached neither the reporter nor diagnostics. Core now uses the event bus's shared protected reporting path, preserving error identity. Synchronous exceptions and rejected observer/reporter promises are contained; denial remains effective. No new event type or stdout diagnostic was added. |
| P2 native PATH exclusions | **Fixed — reproduced and corrected** | Real candidates in directories named `command-wrappers/bin` and `mise/shims` were incorrectly rejected. Both name-based exclusions were removed. Exact Arch markers and real executable identity still exclude owned routing locations. A bounded real external-wrapper regression also exposed missing recursion marking in native passthrough; the same execution guard now covers configured and passthrough launches. PATH order, Windows PATHEXT and supported npm shim handling remain intact. |

## Root causes and scope

Cancellation lacked explicit state independent of AbortSignal's once-only listener;
the post-registration abort recheck could repeat a callback, and settlement removed
only the abort listener. Uninstall had no durable boundary distinguishing a fresh
manifest from an in-progress deletion. Observer setup had an empty catch block.
Executable resolution inferred ownership from directory spelling. The reported
environment defect does not describe the current source.

Production files changed: `src/process.ts`, `src/setup.ts`, `src/core.ts`, and
`src/events.ts`. The small event-bus change centralizes existing diagnostic error
handling instead of duplicating it in Core. `src/middleware.ts` is intentionally
unchanged. README, architecture/testing documentation and this report describe
changed behavior. Test files are enumerated below; `tests/support.ts` sets the
fixture package scope and `tests/fixtures/native.cjs` supplies the acknowledged
SIGTERM-ignoring behavior used by the real POSIX cancellation regression.

## Regression coverage

- `tests/unit/process.test.ts`: deterministic child-process doubles and fake timers
  cover initial/startup/live/repeated abort, normal-exit/error races, synchronous
  termination completion/errors, a single forced kill, and resource disposal.
- `tests/unit/uninstall.test.ts`: interrupted checkpoint replay, partial deletion,
  injected deletion/final-state failure, retry, unexpected missing files, modified
  files, conflicting/invalid state, user configuration and unrelated-file retention.
- `tests/unit/environment.test.ts`: same/different case and values, independent
  variables, validation/reserved names, prepare-only changes and concurrent isolation.
- `tests/unit/resolution.test.ts`: real PATH candidates/precedence, relative and
  nonexistent entries, exact markers, misleading directory names, and POSIX
  symlink identity exclusion.
- `tests/unit/core.test.ts`: observer initialization/reporter exceptions and rejected
  promises, original error identity, continued native execution, denial and disposal.
- `tests/integration/process.test.ts`: actual CLI recovery restores native routing;
  POSIX additionally tests a real child that acknowledges/ignores SIGTERM until
  forced termination. Existing native Windows console, stdio, code, configuration,
  switching, nested, parallel and acceptance scenarios remain in use.

## CI fixture correction

Baseline hosted run [38825913693](https://github.com/Nickshajtan/hcc-harness/actions/runs/38825913693)
passed Windows but failed Ubuntu/macOS at the feasibility experiment, skipping
later test steps. Logs showed that extensionless CommonJS fake CLIs inherited the
repository's ESM package scope (`require is not defined`). A local regression
reproduced that exact error. `tests/support.ts` now writes an explicit CommonJS
package boundary at each isolated fixture root, including copied fake executables.
This is a test-fixture repair, not a routing/product change.

## Executed commands and results

The initial targeted runs intentionally failed before corrections, establishing the
defects above; the environment suite passed unchanged. After corrections:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test:unit`: passed, 47 tests passed and one Windows-inapplicable test skipped.
- `npm run test:integration`: passed in the earlier targeted run (12 passed and
  two POSIX-only tests skipped); the final expanded integration suite passes in
  full local validation and CI as detailed below.
- `npm run test:acceptance`: passed, one complete black-box scenario.
- `npm run check`: passed locally on native Windows x64, Node 24.19.0 / mise
  2026.10.11: **10 test files, 63 passed, 3 platform-specific skips, zero failures**.
  The skips are POSIX signal delivery, a real POSIX signal-ignoring child, and a
  POSIX symlink test. Windows Ctrl+C/Ctrl+Break tests passed. Cancellation state and
  escalation logic also run on Windows through deterministic unit tests.

Final hosted run [38829564913](https://github.com/Nickshajtan/hcc-harness/actions/runs/38829564913)
passed for implementation commit `bb35dab`, including the final passthrough recursion
guard. Type checking, linting, build, the routing experiment, unit tests, integration
tests and black-box acceptance passed on **all three runners**.

| Runner | Unit passed | Integration passed | Experiment passed | Acceptance passed | Platform-only skips |
|---|---:|---:|---:|---:|---:|
| ubuntu-latest | 48 | 14 | 1 | 1 | 2 |
| macos-latest | 48 | 14 | 1 | 1 | 2 |
| windows-latest | 47 | 14 | 1 | 1 | 3 |

The earlier corrective run [38829071462](https://github.com/Nickshajtan/hcc-harness/actions/runs/38829071462)
also passed all three runners before final review added the extra recursion
regression. The failing baseline run above is kept as root-cause evidence, not as
verification of the corrected code. The follow-up commit recording these final
results changes documentation only.
Local Linux execution is unavailable: WSL reports that Virtual Machine Platform/
virtualization must be enabled, and the Docker Linux daemon is unavailable.

## Remaining risks and deviations

- The ownership manifest changes filename during uninstall; it remains intact until
  the final deletion. This uses an atomic rename instead of a new state schema,
  transaction engine or per-file progress log. No recovery state remains on success.
- Unjournaled damage from older versions remains a fresh-state validation error;
  it cannot safely be interpreted as an interrupted uninstall. Restore missing
  managed files before retrying rather than allowing arbitrary absence.
- Concurrent external modification of managed files during validation/deletion is
  not a filesystem transaction. Unknown files and preexisting config are preserved;
  corrupted/conflicting manifests fail explicitly.
- Forced OS termination cannot run JavaScript finalizers. Arch supervises only its
  direct child; process-tree supervision remains out of scope. Trusted observer or
  reporter promises that never settle can still delay execution, like existing
  awaited subscribers.
- Scope includes a minimal shared reporter in `src/events.ts` and the demonstrated
  cross-platform fixture repair, as needed to avoid duplicate diagnostic handling
  and run the required matrix. No environment rewrite was made for the disproven
  finding. Callback return types explicitly accept promises in a backward-compatible
  manner so rejected diagnostics cannot become unhandled rejections.
- The requested hosted Ubuntu/macOS/native Windows matrix is verified. Windows
  ARM64 and real third-party interactive TUI smoke tests remain outside the executed
  validation; no verification is claimed for those environments.
