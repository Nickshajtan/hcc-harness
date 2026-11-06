# F1-F5 stabilization implementation record

Baseline: `b4c35238614e1df7dc696b05bb286ae6c34b2825` (fetched upstream main).
Production implementation: `e1877b4ce204f7bf42c791c1766e01107cfdece1`.
Branch: `fix/arch-f1-f5-stabilization`. Implementation environment: Windows x64,
Node 24.19.0. The original two review reports were absent locally; the supplied
corrective specification was the implementation authority. All five findings
were confirmed against the fetched baseline. The initial working tree was clean.

## Result and compatibility

The pre-merge verdict remains **BLOCKED** by reproduced Windows console readiness
failure (see the final review below). Exact reviewed-head CI is successful.
This record does not certify platform
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

## Executed checks (2026-11-05/06)

Commands ran from the repository root. Bootstrap, Wizard and coverage used
PowerShell `$env:ARCH_WINDOWS_SDK='10.0.17763.0'` where needed. Default SDK
10.0.19041.0 failed because `specstrings_strict.h` is absent; selecting the complete
installed SDK fixed that build prerequisite without changing project source.

| Command                                                                                                                                                                                                                                                        | Result                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                                                                                                                                                                                            | PASS                                                                                                                                |
| `npm run lint`                                                                                                                                                                                                                                                 | PASS                                                                                                                                |
| `npm run format:check`                                                                                                                                                                                                                                         | PASS                                                                                                                                |
| `npm run lint:baseline`                                                                                                                                                                                                                                        | PASS, zero known/new warnings                                                                                                       |
| `npm run test:quality`                                                                                                                                                                                                                                         | PASS, 24 tooling tests                                                                                                              |
| `npm run check:dependencies`                                                                                                                                                                                                                                   | PASS, 62 modules / 175 dependencies                                                                                                 |
| `npm run build`                                                                                                                                                                                                                                                | PASS                                                                                                                                |
| `npm run build:bootstrap` with selected SDK                                                                                                                                                                                                                    | PASS                                                                                                                                |
| `npm run test:wizard` with selected SDK, outside sandbox                                                                                                                                                                                                       | PASS: 76 unit tests and 15 terminal checks                                                                                          |
| `node node_modules/vitest/vitest.mjs run tests/unit tests/integration/stabilization.test.ts tests/integration/setup-publication.test.ts tests/acceptance/routing.test.ts --reporter=default --reporter=json --outputFile=.test-state/stabilization-final.json` | PASS final: 39 files, 732 passed / 9 platform skips / zero failures; JSON totals checked against individual assertion records       |
| `npx vitest run tests/integration/setup-publication.test.ts tests/integration/stabilization.test.ts --reporter=default --reporter=json --outputFile=.test-state/stabilization-integration.json`                                                                | PASS: 19 passed / 4 POSIX skips, including real publication interruption, verified retained commit and manual owned rollback/reinit |
| `node scripts/check-mutation.mjs core process lifecycle cli`                                                                                                                                                                                                   | PASS, current source verified; all maintained per-file assertion-only gates met                                                     |
| `node scripts/report-effects-mutation.mjs`                                                                                                                                                                                                                     | PASS, all seven current effect scopes met 85% assertion-only gates; removal 64/64 kills                                             |

The final discovery regressions also preserve execute-only native PATH precedence,
Windows case-insensitive identity, quoted paths, and foreign cwd-relative wrapper
operands. Text status explicitly renders setup observations in healthy and invalid
states; JSON keeps existing fields/schema and adds optional setup diagnostics.

### Mutation measurements

All listed `npm run test:mutation:*` commands completed with exit 0 on their final
runs. Validators above checked current production source, complete scopes and
assertion-only thresholds. No timeout credit, exclusions or lowered thresholds.

| Command                           | Assertion kills / total | Assertion-only score | Timeouts |
| --------------------------------- | ----------------------: | -------------------: | -------: |
| `npm run test:mutation:core`      |               224 / 234 |               95.73% |        0 |
| `npm run test:mutation:process`   |               423 / 442 |               95.70% |        0 |
| `npm run test:mutation:lifecycle` |               386 / 398 |               96.98% |        0 |
| `npm run test:mutation:cli`       |               469 / 487 |               96.30% |        5 |
| `npm run test:mutation:effects`   |               698 / 762 |               91.60% |       12 |

Effect measurement took 63m15s locally; the inspected hosted source-identical
measurement took 6m01s. These are observations, not a causal diagnosis or a
performance guarantee. The local effect run completed before a requested stop;
the stop found no process and did not terminate anything. One earlier effect run
was deliberately stopped after its source snapshot became stale, then rerun in
full. No older passing report was reused. Earlier Core/process pilots exposed
missing boundary assertions; added regressions raised their final scores without
changing gates. Initial sandbox pilots also encountered taskkill access denial;
final unsandboxed runs completed successfully. Stryker emitted sandbox symlink
warnings. Raw reports remain under `reports/mutation-*/`.

### Earlier broad failures retained

| Command / environment                                 | Result and classification                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`, default SDK                          | FAIL: missing SDK header; environment prerequisite corrected by explicit SDK selection                                                      |
| `npm run check`, selected SDK in sandbox              | FAIL: 775 passed / 5 failed / 39 skipped; superseded assertions subsequently corrected, plus mise OS access denied                          |
| `npm run check`, selected SDK outside sandbox         | FAIL: 776 passed / 4 failed / 47 skipped, plus stable-runtime setup/teardown errors; two assertion failures in that snapshot were corrected |
| `npm run test:coverage`, selected SDK outside sandbox | FAIL: 810 passed / 3 failed / 39 skipped, plus stable-runtime teardown failure. No numeric local coverage report was generated              |

Those exploratory runs preceded final compatibility/fixture corrections. Final
focused results do not erase their Windows native failures: ConsoleDriver reported
`Native never started`, stable routed execution/console tests timed out, and teardown
hit `EPERM` unlinking the stable executable. A previous broad run also timed out
in a mise consumer and could not close owned children. Mechanisms remain
**UNRESOLVED**; a new product regression is not ruled out. Do not attribute them to
sandboxing, load, antivirus or older incidents without causal evidence. Existing
helpers retained failed fixtures/diagnostics. `coverage/tests.json` retains the
failed broad assertion report. No failing test, assertion or deadline was weakened.

Corrected assertion failures were test-assumption errors for the mandated new
SIGINT/event/starter contracts. A remaining npm-linked POSIX test expected PID-only
SIGINT forwarding; it now tests ignored PID-only SIGINT followed by SIGTERM/SIGHUP.
The initial macOS PTY failure (`posix_spawnp failed`) led to applying the existing
Wizard/runtime fixture's known node-pty helper executable-mode preparation, with
restoration logged and actual spawn failures still fatal. No native provider or
system tool is repaired. A separate npm invocation with forwarded reporter flags
was rejected before Vitest started; the final run used the direct installed Vitest
entry above. That invocation produced no test result.

### Inspected hosted CI

At commit `6d53d3060d6647b82c1dc1e13b8bc9cfe66e4f68`, the following ordinary CI
runs were inspected as successful:

- [Regression: Ubuntu, Windows, macOS](https://github.com/Nickshajtan/hcc-harness/actions/runs/42109525522).
- [Quality coverage, mutation and effect gates](https://github.com/Nickshajtan/hcc-harness/actions/runs/42109525954).
- [Required runtime portability aggregate](https://github.com/Nickshajtan/hcc-harness/actions/runs/42109525554).
- [Wizard matrix](https://github.com/Nickshajtan/hcc-harness/actions/runs/42109525699).
- [Windows reliability](https://github.com/Nickshajtan/hcc-harness/actions/runs/42109525646).

The earlier [91cde9b regression failure](https://github.com/Nickshajtan/hcc-harness/actions/runs/42104141765)
and [quality failure](https://github.com/Nickshajtan/hcc-harness/actions/runs/42104140714)
were inspected: obsolete npm SIGINT expectations and the macOS PTY prerequisite
failed. Linux group/repeated-SIGINT and actual PTY cases passed in that run.
Subsequent hosted success is evidence for the referenced commit, not resolution
of local Windows incidents. The final Windows identity/foreign-relative-wrapper
refinements have fresh local focused and mutation evidence; the final PR head
requires its own CI refresh. No uninspected final-head CI result is claimed.
These automatic repository checks are not the three separate provider acceptance
passes requested for later.

### Exact final local skips

The final focused JSON records these nine Windows-host skips:

- `stabilization.test.ts`: preserves process-group SIGINT without forwarding/escalation and propagates 0.
- `stabilization.test.ts`: preserves process-group SIGINT without forwarding/escalation and propagates 130.
- `stabilization.test.ts`: preserves native SIGINT termination and cleanup.
- `stabilization.test.ts`: handles terminal Ctrl+C in an actual foreground PTY.
- `resolution.test.ts`: skips a symlink to a marked wrapper by real executable identity.
- `resolution.test.ts`: skips non-executable files and resolves native symlink identity.
- `resolution.test.ts`: accepts a symlink to a native executable by canonical identity.
- `setup-contract.test.ts`: prepares permissions before publication and preserves a chmod failure.
- `lifecycle-effects.test.ts`: preserves a complete private stage and the exact permission failure before publication.

The earlier broad run additionally left 26 opt-in runtime tests unprovisioned;
all exact skipped/failed assertion records are retained in its JSON. Windows
ARM64, real provider TUIs, WSL2 acceptance and paid inference were not run. The
three separate platform acceptance passes were not performed. Dedicated stable
contracts ran within broad suites and hosted CI; `npm run test:stable` was not
separately repeated. The stable mutation pilot was not rerun because its production
modules were unchanged. Inspection diagnostics are outside maintained mutation
scopes and are protected here by real read-only/publication/recovery regressions.

## Remaining risks and next passes

GO remains **BLOCKED**: local Windows native/teardown failures reproduced in the
final bounded review below. Reviewers should also assess the intentional
unconfigured-event compatibility change and static wrapper-recognition limits.
No standards gate was weakened; no general recovery or orchestration API was added.

For Windows, first isolate native readiness, stable lifetime and teardown failures;
then verify empty/legacy starter ownership, case-insensitive native identities,
mixed-provider nesting and existing console/runtime contracts without relaxing
deadlines. For WSL2, run foreground group/PTY/repeated-SIGINT, nested signal,
SIGTERM/SIGHUP and ownership/recovery cases on a supported filesystem. For macOS,
verify the recorded node-pty helper preparation, actual PTY signals, canonical and
symlink identities, and three-level mixed-provider nesting on supported APFS.
Real provider TUI Ctrl+C acceptance belongs to those subsequent passes.

## Final pre-merge review (2026-11-06)

Fetched PR head and local HEAD both equal
`0903d8e3930cb8ec96da59cf35bed53a175a1abc`; the working tree was clean.
The following five workflows were inspected through the PR check API on that
exact SHA, all COMPLETED/SUCCESS (including all matrix jobs and aggregates):

- [Arch checks](https://github.com/Nickshajtan/hcc-harness/actions/runs/42138071328).
- [Quality measurements, including effects](https://github.com/Nickshajtan/hcc-harness/actions/runs/42138071508).
- [Runtime portability and required aggregate](https://github.com/Nickshajtan/hcc-harness/actions/runs/42138071340).
- [Wizard checks](https://github.com/Nickshajtan/hcc-harness/actions/runs/42138071577).
- [Windows reliability](https://github.com/Nickshajtan/hcc-harness/actions/runs/42138071469).

These supersede the earlier CI-refresh uncertainty, but do not resolve the local
incidents. This report-only follow-up does not change production or test source.
CI for any subsequent documentation commit must be checked separately; the links
above certify only the explicitly named SHA.

### Bounded Windows investigation

One selected reproduction run used installed Node 24, the explicit complete SDK,
normal process permissions outside the sandbox, and unchanged existing deadlines:

```powershell
$env:ARCH_WINDOWS_SDK='10.0.17763.0'
$env:npm_execpath=(Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules/npm/bin/npm-cli.js')
node node_modules/vitest/vitest.mjs run tests/integration/stable-runtime.test.ts tests/integration/native-lifetime.test.ts tests/integration/process.test.ts -t 'builds, installs|preserves console signals|bounds owned bootstrap|creates, executes|mise activates' --maxWorkers=1 --reporter=default --reporter=json --outputFile=.test-state/premerge-windows.json
node node_modules/vitest/vitest.mjs run tests/integration/process.test.ts -t 'handles real Windows Ctrl' --maxWorkers=1 --reporter=default --reporter=json --outputFile=.test-state/premerge-console.json
node node_modules/vitest/vitest.mjs run tests/unit/cli-run.test.ts tests/integration/stabilization.test.ts --reporter=default --reporter=json --outputFile=.test-state/premerge-invariants.json
```

| Incident                    | Current evidence                                                                                                                                                                                                            | Classification                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| ConsoleDriver readiness     | FAIL: same `Native never started`, driver exit 3762504530; trace reaches preflight/prepareLaunch. Existing console deadline unchanged.                                                                                      | Reproduced; UNRESOLVED, product versus fixture cause not established |
| Stable routed execution     | FAIL: existing 120000ms test timeout. The direct native comparison in that test completed its exit-7/output assertions before routing; live snapshot showed generated route → stable bootstrap → Node CLI → native fixture. | Reproduced; UNRESOLVED                                               |
| Stable console routing      | FAIL: existing 120000ms timeout; no inference about which console phase caused it.                                                                                                                                          | Reproduced; UNRESOLVED                                               |
| Stable executable removal   | FAIL: suite teardown `EPERM` unlinking retained fixture `arch-fixture-lQ5Sja/stable ü's & app/arch.exe`. Snapshot records live bootstrap ancestry, but does not identify the denying handle.                                | Reproduced; UNRESOLVED unsafe lifecycle uncertainty                  |
| mise consumer / child close | PASS: existing active/inactive consumer test, 7017ms; owned bootstrap cancellation test also passed. Earlier failure mechanism remains unknown.                                                                             | NOT REPRODUCED; not RESOLVED                                         |
| Raw native lifetime         | PASS: 16 independent execute/close/unlink/recreate operations, serial and three lanes; teardown completed.                                                                                                                  | Comparator PASS; does not explain routed failure                     |

The selected run finished itself in 470.34s: 3 passed, 2 failed, 21 selection
skips, plus one failing suite teardown. Console reproduction: 1 failed, 16
selection skips. No retries until green, timeout increases, assertion changes or
mutation changes. An additional direct invocation of the same retained native
fixture with stdin closed and FAKE_WAIT/FAKE_STDIN disabled exited 0 within a
ten-second bound, with its JSON output and `native stderr`. This is a readiness
comparator, not an equivalent console/signal experiment.

Local evidence: `.test-state/premerge-{windows,console,invariants}.json`,
`.test-state/premerge-direct.json`, `.test-state/premerge-processes.json`, and
the existing `coverage/tests.json`. Failed stable resources remain under
`C:/Users/38098/AppData/Local/Temp/arch-fixture-lQ5Sja` where teardown stopped;
partial cleanup may have removed other files. No foreign or historical process
was killed. Snapshot PIDs are historical evidence, never permission to terminate
a subsequently reused PID. Process observation is not proof of signal delivery,
ownership of every descendant, or the cause of filesystem denial.

No incident is classified RESOLVED or EXTERNAL / CONTAINED: no evidenced causal
mechanism or verified corrective containment exists. Hosted success and direct
native success do not justify attributing these failures to Windows, antivirus,
sandboxing or timing. Investigation stops here rather than expanding this PR.

### F1/F3 source inspection and decision

Focused invariant result: PASS, 21 passed / 4 POSIX-only skips. Source inspection
confirms the post-spawn POSIX SIGINT branch returns before abort; launch remains
non-detached with inherited stdio, and actual settlement controls status. The
Windows branch and child cancellation/escalation policy are retained; their real
console reliability is not established by inspection. SIGTERM/SIGHUP still abort
through the existing lifecycle. POSIX group/PTY tests were not rerun on Windows.

Core creates a fresh UUID, session, bus and pipeline each call. Three-level tests
verify distinct IDs, immediate parent relationships, independent middleware and
terminal events, cleanup counts, and exit 0/17. `ARCH_ACTIVE` has no passthrough
branch. Resolver canonical/marked/generated-wrapper checks still block router
self-targets. Parent metadata appears only in context, event correlation and
reserved child environment composition; it is not consulted for authorization.
No F1/F3 redesign or production correction was justified by this investigation.

**Merge recommendation: BLOCKED. Do not merge automatically.** The exact reviewed
head has green mandatory hosted checks, but local critical readiness and teardown
failures reproduce. The smallest necessary next action is a focused direct versus
routed console/lifetime experiment that captures the wait stage and denying
process/handle, followed by a narrow fix and regression for the demonstrated
mechanism. If that mechanism lies outside F1–F5, obtain an explicit scope decision;
do not silently expand stabilization. Reclassify only with causal evidence.
The separate provider acceptance passes remain deferred. After blocker closure,
they should cover Windows console/native lifetime and stable teardown, WSL2
foreground group/PTY signals, and macOS PTY/symlink/nested routing. No real model
inference, provider acceptance or full validation matrix was performed here.

## Changed files

- `docs/architecture.md`
- `docs/compatibility.md`
- `docs/decisions/nested-execution.md`
- `docs/stabilization-f1-f5.md`
- `docs/usage.md`
- `src/cli/native-run.ts`
- `src/cli/presentation.ts`
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
- `tests/unit/cli-dispatch.test.ts`
- `tests/unit/cli-run.test.ts`
- `tests/unit/core.test.ts`
- `tests/unit/environment.test.ts`
- `tests/unit/execution-policy.test.ts`
- `tests/unit/process-failures.test.ts`
- `tests/unit/process.test.ts`
- `tests/unit/resolution.test.ts`
- `tests/unit/routing-journal.test.ts`
- `tests/unit/uninstall.test.ts`
