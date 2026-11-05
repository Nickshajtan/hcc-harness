# F1-F5 stabilization implementation record

Baseline: `b4c35238614e1df7dc696b05bb286ae6c34b2825` (fetched upstream main).
Production implementation: `f45debe0728dc48aa012c574075ff4844f932605`.
Branch: `fix/arch-f1-f5-stabilization`. Implementation environment: Windows x64,
Node 24.19.0. The original two review reports were absent locally; the supplied
corrective specification was the implementation authority. All five findings
were confirmed against the fetched baseline. The initial working tree was clean.

## Result and compatibility

GO for platform regression is **BLOCKED** by unresolved native Windows fixture
failures and outstanding POSIX evidence. This record does not certify platform
acceptance or resolve the existing reliability incidents.

- F1: CLI SIGINT cancels before spawn. After POSIX spawn it neither aborts nor
  forwards/escalates; actual child settlement determines the result. SIGTERM,
  SIGHUP, explicit library AbortSignal cancellation and Windows console policy
  retain their existing contracts. Spawn notification errors wait for child
  settlement before surfacing, so a throwing callback cannot orphan the child.
- F2: additive optional schema-1 `setup` status fields report claim/bootstrap
  presence, stage directories, manual inspection and documentation. Diagnostics
  remain read-only; invalid claims retain nonzero CLI status. Both manual retained
  commit and proven owned rollback/reinitialization are exercised in private
  fixtures, alongside actual killed publication checkpoints and foreign collisions.
- F3: no inherited `ARCH_ACTIVE` rejection or native-passthrough shortcut. Each
  invocation creates a session and ID. Optional parent metadata is untrusted
  correlation in middleware context and schema-1 events. Canonical target and
  recognized generated-wrapper checks prevent routing into Arch; wrapper cycles
  are detected within resolution, without limiting legitimate agent ancestry.
- F4: [usage](usage.md#generated-artifacts-and-starter-middleware) explains local
  generated paths, stable identity, source-control treatment and safe recreation.
  No Git advisory, ignore-file edits, relative launcher redesign or relocation.
- F5: new starters use `middleware = []`. Exact legacy/new starter content remains
  removable only with the existing ownership flag. Customized/foreign content is
  preserved. Middleware-dependent fixtures explicitly opt into demo.

Intentional compatibility changes: unconfigured invocations now emit their own
execution lifecycle, with an empty pipeline and cwd as project root. Existing
schema-1 fields remain; parent event metadata and setup diagnostics are additive.
`ARCH_ACTIVE` remains current identity in the child's environment, rather than an
ancestry prohibition. Middleware ordering, failures, cleanup, native environment
filtering, installation hashes/publication, runtime selection and policy authority
are otherwise preserved. There is no automatic configuration migration.

The [decision note](decisions/nested-execution.md) explains the mandatory deviation
from the original review's native-passthrough recommendation. Arbitrary third-party
wrapper behavior cannot always be proven by static analysis. Absolute native paths
can bypass PATH routing. Correlation does not confer authorization, budget or sandbox
privileges. No orchestration, interception boundary or budget redesign was added.

## Executed checks

Commands below ran from the repository root. Bootstrap/coverage used PowerShell
`$env:ARCH_WINDOWS_SDK='10.0.17763.0'` where indicated. Default SDK 10.0.19041.0
failed compilation because `specstrings_strict.h` is absent; selecting the complete
installed SDK fixed that build prerequisite without changing project source.

| Command                                                                                                                                                                                                                                 | Result                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                                                                                                                                                                     | PASS after production changes; final static recheck recorded below                                                                                                                  |
| `npm run lint`                                                                                                                                                                                                                          | Final recheck pending; intermediate fixture literal-throw diagnostic corrected using an explicitly untyped boundary                                                                 |
| `npm run format:check`                                                                                                                                                                                                                  | PASS; final documentation formatting rechecked before completion                                                                                                                    |
| `npm run lint:baseline`                                                                                                                                                                                                                 | PASS, zero known/new warnings                                                                                                                                                       |
| `npm run test:quality`                                                                                                                                                                                                                  | PASS, 24 tooling tests                                                                                                                                                              |
| `npm run check:dependencies`                                                                                                                                                                                                            | PASS, 62 modules / 175 dependencies                                                                                                                                                 |
| `npm run build`                                                                                                                                                                                                                         | PASS                                                                                                                                                                                |
| `npm run build:bootstrap` with selected SDK                                                                                                                                                                                             | PASS                                                                                                                                                                                |
| `npx vitest run tests/unit tests/integration/stabilization.test.ts tests/integration/setup-publication.test.ts tests/acceptance/routing.test.ts --reporter=default --reporter=json --outputFile=.test-state/stabilization-focused.json` | PASS: 39 files, 703 passed / 8 platform skips                                                                                                                                       |
| `npx vitest run tests/unit/resolution.test.ts tests/unit/process-failures.test.ts tests/unit/process.test.ts`                                                                                                                           | PASS: 90 passed / 2 POSIX symlink skips                                                                                                                                             |
| `npx vitest run tests/integration/setup-publication.test.ts tests/integration/stabilization.test.ts --reporter=default --reporter=json --outputFile=.test-state/stabilization-integration.json`                                         | PASS: 19 passed / 4 POSIX signal/PTY skips                                                                                                                                          |
| `npm run check`                                                                                                                                                                                                                         | FAIL: initial default-SDK build; selected-SDK sandbox run reached 775 passes / 5 failures / 39 skips, including superseded assertions subsequently corrected and mise access denied |
| `npm run check` outside sandbox with selected SDK                                                                                                                                                                                       | FAIL: 776 passes / 4 failed tests / 47 skips, plus stable-runtime setup/teardown failures; two assertion failures in that snapshot were subsequently corrected                      |
| `npm run test:coverage` outside sandbox with selected SDK                                                                                                                                                                               | FAIL: 810 passed / 3 failed / 39 skips, plus stable-runtime teardown failure. No numeric coverage report was generated; do not claim coverage gates passed                          |
| `npm run test:mutation:core`; `node scripts/check-mutation.mjs core`                                                                                                                                                                    | PASS final: 224/234 assertion kills (95.73%), zero timeouts/errors. Per-file gates pass; entrypoint 90%, environment 100%                                                           |
| `npm run test:mutation:process`                                                                                                                                                                                                         | Final rerun pending; first report failed native-environment's 90% gate (76.22%) and worker disposal was denied; boundary regressions were added                                     |
| `npm run test:mutation:cli`                                                                                                                                                                                                             | Final rerun pending; initial dry run lacked the packaged publication helper. Sandbox prerequisite added without changing mutation scope/thresholds                                  |

Earlier focused failures were assertions for superseded event/default behavior,
plus missing assertions in new fixtures; they were corrected, not removed or
suppressed. Earlier Core mutation had a 75% entrypoint result and sandbox taskkill
failures; added parent-boundary/root-discovery tests and an unsandboxed rerun
established the final result above. Stryker also reported existing sandbox symlink
warnings. No timeout credit, assertion weakening or threshold reduction was used.

## Unresolved evidence and next passes

The final broad coverage run failed Windows ConsoleDriver readiness (`Native never
started`), stable runtime routed execution/console timeouts, and `EPERM` unlinking
the installed stable executable in teardown. A previous broad run also timed out
in a mise consumer and could not close owned teardown children. A later consumer
pass does not resolve that failure. Fixture locations/diagnostics were retained by
the existing helpers; the coverage assertion report is `coverage/tests.json`.
These mechanisms remain **UNRESOLVED**; a new product regression is not ruled out.
They must not be attributed to sandboxing, load, antivirus or the pre-existing
incidents without causal evidence. No failing test or timeout was weakened.

POSIX process-group/repeated SIGINT, signal termination and actual PTY cases are
implemented but NOT TESTED on this Windows host. Existing opt-in Node/runtime
matrix tests were not provisioned (26 skips in broad runs). Windows ARM64, real
provider TUIs and paid inference were not run. Dedicated terminal Wizard and
additional effect/lifecycle mutation measurements are recorded at completion.
The three separate platform acceptance passes were not performed.

For Windows, isolate the native readiness/stable lifetime and teardown failures
before declaring GO; rerun default/legacy starter ownership, nested mixed-provider
fixtures, and existing console/runtime contracts without relaxing deadlines.
For WSL2, run the POSIX group and PTY cases, nested signal case, SIGTERM/SIGHUP
regressions and owned publication/recovery on a supported filesystem.
For macOS, run the same POSIX cases plus canonical/symlink launcher identity and
three-level mixed-provider nesting on supported APFS. Real provider TUI Ctrl+C
acceptance belongs to the subsequent platform passes, not this implementation.

## Changed files

- `docs/architecture.md`
- `docs/compatibility.md`
- `docs/decisions/nested-execution.md`
- `docs/usage.md`
- `src/cli/native-run.ts`
- `src/core/execution-environment.ts`
- `src/core/execution-session.ts`
- `src/core/index.ts`
- `src/events.ts`
- `src/lifecycle/inspection.ts`
- `src/lifecycle/manifest.ts`
- `src/lifecycle/removal.ts`
- `src/middleware.ts`
- `src/process/executable-resolver.ts`
- `src/process/launch.ts`
- `src/process/native-environment.ts`
- `src/process/windows-npm-shim.ts`
- `stryker.cli.config.json`
- `tests/acceptance/routing.test.ts`
- `tests/feasibility/runtime-bootstrap.test.ts`
- `tests/feasibility/runtime-contract.test.ts`
- `tests/integration/lifecycle.test.ts`
- `tests/integration/npm-cli.test.ts`
- `tests/integration/process.test.ts`
- `tests/integration/setup-publication.test.ts`
- `tests/integration/stabilization.test.ts`
- `tests/integration/stable-runtime.test.ts`
- `tests/support.ts`
- `tests/unit/cli-run.test.ts`
- `tests/unit/core.test.ts`
- `tests/unit/environment.test.ts`
- `tests/unit/execution-policy.test.ts`
- `tests/unit/process-failures.test.ts`
- `tests/unit/process.test.ts`
- `tests/unit/resolution.test.ts`
- `tests/unit/routing-journal.test.ts`
- `tests/unit/uninstall.test.ts`
