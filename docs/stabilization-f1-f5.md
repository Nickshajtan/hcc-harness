# F1-F5 stabilization implementation record

> Historical implementation/investigation record. Original observations and verdicts
> below retain their revision and scope. Current guidance: [architecture](architecture.md),
> [compatibility](compatibility.md), and [validation index](validation/README.md).
> The early BLOCKED assessment is superseded for PR review by the controlled Avast
> comparison later in this same record (CONDITIONAL GO). Later Windows conditional
> and WSL2 GO control reports are separate acceptance; active Avast remains open.

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

## Windows lifecycle root-cause comparison

Investigation date: 2026-11-07. Baseline:
`b4c35238614e1df7dc696b05bb286ae6c34b2825`; candidate:
`7a83db2e3d384a9ac5e60d821edbac73998e0f18` (fetched and confirmed unchanged).
The main working tree was clean. Separate detached worktrees under
`.test-state/lifecycle-{baseline,candidate}` contain independent source builds,
native bootstrap builds and test-created stable installations. No global Arch
installation or provider configuration was changed.

### Environment and preparation

Same Windows 10 Enterprise host, version 10.0.19045; Windows PowerShell 5.1.19041.6456;
Node `v24.19.0`, npm `12.0.2`, executable `C:/nvm4w/nodejs/node.exe`;
SDK `10.0.17763.0`, MSVC `14.16.27023`. Checkouts reside on `D:`, native
fixtures on `C:/Users/38098/AppData/Local/Temp`. Test commands and process
inspection ran with the execution tool's explicit outside-sandbox approval;
ordinary restricted calls cannot query CIM. This does not disable host security.
Minimal environment selection follows `world()`; no credential/environment dump
was collected. Both runs set the same SDK, npm CLI path and repository-local mise.

Independent `npm ci --ignore-scripts` attempts stalled; npm recorded
`UNABLE_TO_VERIFY_LEAF_SIGNATURE` for an audit request. Offline/no-audit attempts
also did not settle and were stopped using their current process identities.
Retained dependency directories could not be renamed (access denied). The existing
locked dependency installation was therefore copied into both worktrees with
`robocopy /E /R:0 /W:0`, without copying application/stable build artifacts.
Each checkout then independently ran
`node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json` and
`node scripts/build-stable-bootstrap.mjs`: PASS, exit 0. This dependency-preparation
deviation is explicit; its stalls are not classified as W1–W4 root causes.
Both lockfiles have SHA-256
`3238abf5e407d652ae7a447e4cefb6a15ff84a875ca5c9879551d59c1e464762`.

### Unchanged original scenarios

The following command ran once per revision, sequentially, with the existing
120-second test/hook deadlines and unchanged ConsoleDriver ten-second barrier:

```powershell
$env:ARCH_WINDOWS_SDK='10.0.17763.0'
$env:npm_execpath=(Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules/npm/bin/npm-cli.js')
$env:MISE_BIN='D:\AI\projects\projects\harness\.tools\mise\bin\mise.exe'
node node_modules/vitest/vitest.mjs run tests/integration/stable-runtime.test.ts tests/integration/process.test.ts -t 'builds, installs|preserves console signals|handles real Windows Ctrl|mise activates' --maxWorkers=1 --reporter=default --reporter=json --outputFile=.test-state/lifecycle-original.json
```

| Scenario                                            | Baseline                                               | Candidate                        | Classification                                                         |
| --------------------------------------------------- | ------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------- |
| W1 real Windows Ctrl+C/Ctrl+Break test              | FAIL, 82.343s, `Native never started`, exit 3762504530 | FAIL, 83.530s, same error/status | Reproduced before stabilization; initiating cause UNRESOLVED           |
| W2 stable routed execution/source relocation/deinit | FAIL, 120.034s                                         | FAIL, 120.030s                   | Reproduced before stabilization; incomplete settlement UNRESOLVED      |
| W3 stable console routing/cleanup                   | FAIL, 120.014s                                         | FAIL, 120.006s                   | Reproduced before stabilization; incomplete settlement UNRESOLVED      |
| W4 stable executable unlink                         | FAIL, `EPERM`                                          | FAIL, `EPERM`                    | Active image user identified; upstream suspension/retention UNRESOLVED |
| mise active/inactive consumer comparator            | PASS, 7.617s                                           | PASS, 6.606s                     | Comparator PASS; no separate mise investigation                        |

Each revision: 1 passed, 3 failed, 21 selection skips, plus failing suite teardown;
command exit 1. Baseline started `2026-11-06T23:55:48.294Z`, last assertion ended
`2026-11-07T00:02:39.503Z`, runner duration 411.22s. Candidate started
`2026-11-07T00:06:25.707Z`, last assertion ended
`2026-11-07T00:13:25.503Z`, runner duration 422.11s. Ctrl+Break assertions were
not reached after Ctrl+C failed. These results establish that the four symptoms
predate PR #24; they do not establish that every underlying mechanism is identical
or that an additional candidate-specific defect is impossible.

### Process timeline and shared-cause evidence

The bootstrap C++, ConsoleDriver C#, native C# and `capture/run` synchronization
are unchanged between these revisions (the support-file diff only adds parent
event metadata). ConsoleDriver starts its child with inherited standard handles
and a new hidden console, polls `FAKE_LOG`, then attaches to that child's console
and broadcasts a control event. It does not require a fixed descendant depth.
The native fixture appends its JSON readiness record before stdout, stdin reading
or its optional 60-second wait. Therefore missing readiness cannot be attributed
to `ReadToEnd()` without additional evidence.

Baseline W2 observations, UTC, from CIM creation times and bounded snapshots:

| Time                    | Observed boundary                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| 23:56:41                | Direct native comparator process entries appeared; later source assertions advanced to routed launch |
| 23:57:06.514            | Generated route PID 18348 created                                                                    |
| 23:57:06.649            | Stable bootstrap PID 9920 created, parent 18348                                                      |
| 23:58:02.581            | Selected Node CLI PID 7212 created, parent 9920                                                      |
| 23:58:02.740 / .774     | Native command process entries 1376 / 16316 appeared under 7212; only one had a queryable image path |
| 23:59:25.001            | W3 bootstrap PID 20512 created under route 12332                                                     |
| After runner settlement | PID 20512 remained, `HasExited=false`, one thread Waiting/Suspended                                  |

Candidate W2 likewise showed route 14888, bootstrap entry 4284, selected Node
12852 and native entry 21488; process ancestry included another parent 3408 that
had settled before follow-up observation. Creation times, paths and parent IDs
are retained; an inaccessible image path is not proof that a process never ran.
No native exit/close or Arch finalization was established for these failing
chains. The snapshots prove spawn/process creation beyond middleware, but do not
prove native managed initialization or distinguish missing readiness emission
from file virtualization. W1 traces on both revisions reach execution.started,
preflight and prepareLaunch before the readiness failure.

Host instrumentation is now evidenced, not guessed: the affected baseline
bootstrap and Node module inventories include
`C:/Program Files/Avast Software/Avast/aswhook.dll`. The local
`autosandbox.log` explicitly records `Result: Sandboxing` / `Sandboxing (no custody)`
and `Instrumentation inside sandbox requested` for the exact current-run native,
bootstrap and console-driver paths, with matching launch times. Candidate entries
are retained separately. These decisions establish active external intervention;
they do not alone establish which component suspended a particular thread, the
duration spent inside CreateProcess, or whether readiness writes were redirected.
No security settings or exceptions were changed.

For W4, the built-in read-only Restart Manager API identified baseline bootstrap
PID 20512, including process start FILETIME, as the stable executable's user.
Its parent had settled. After revalidating both creation time
`23:59:25.001029Z` and the current fixture command path, termination of this
test-owned leftover changed Restart Manager's user count from 1 to 0. Unlink of
that exact generated executable then succeeded at `00:41:07.678Z`. Thus an active,
suspended image explains this baseline unlink denial; it was not an unexplained
post-close filesystem error. Candidate Restart Manager also identified an active
`arch.exe` user, PID 12404 with its start FILETIME. No historical PID or foreign
resource was terminated/deleted. Manual release is diagnostic cleanup, not a
product fix or a general permission to kill descendants.

### Bounded diagnostic experiment and evidence boundary

One candidate-only observational A/B/C experiment uses the same native fixture,
arguments `[]`, EOF stdin, controlled environment, real ConsoleDriver/new-console
attachment and event `0`: direct native, development-generated route and stable
route. It keeps original driver deadlines and repository test deadlines. It is
an observation harness, not a replacement regression or a passing acceptance gate.
It is retained only in the isolated checkout, along with its fixture.

Direct native: driver request `00:40:23.027Z`, exit and close
`00:40:51.602Z` / `.606Z`, status 3221225786; native PID 12200 emitted both JSON
readiness and stdout, then the real Ctrl+C path completed. Development route:
execution.started at `00:42:01.890Z`, driver exit `00:42:11.640Z` with
`Native never started` / 3762504530, close `00:42:29.530Z`; readiness file remained
absent. The 17.890-second exit-to-close gap demonstrates that parent exit was not
stream settlement; the exact handle holder was not identified. Process snapshots
also captured no-module process entries alongside a CLR-initialized driver.
These observations do not establish two legitimate Arch executions or identify
the origin of the extra entries.

Stable route: driver request `00:43:36.472Z`, exit `00:43:46.559Z`, status
3762504530; close was not observed before the unchanged 120-second diagnostic
deadline. Its leftover bootstrap PID 17816 also had one suspended thread and
`HasExited=false`. Diagnostic runner exit 1, duration 326.16s. Its two completed
observation cases are not two behavioral PASS results: the harness records
outcomes without asserting console success; the development route failed readiness.

Final cleanup revalidated current process creation times and fixture paths before
terminating candidate bootstrap 12404 and diagnostic bootstrap 17816. Restart
Manager's candidate image-user count changed to zero; candidate executable unlink
succeeded at `00:47:20.868Z`. A final CIM query at `00:47:20.678Z` found zero
remaining matching owned processes across all five current-run fixture roots.
This required manual diagnostic cleanup, so it is not evidence of correct automatic
teardown. Other fixture files remain for inspection; no recursive historical
resource deletion was performed.

A prepared preload tracer was not enabled in this experiment; it supplies
no evidence. There is no claim of complete instrumentation of all sixteen requested
boundaries. Bootstrap/CLI process entry and native process creation were observed;
native managed entry/readiness, finalization, all descendant exits and the
security-intervention call stack remain incomplete where explicitly noted.

### Decision and next observation

**BLOCKED.** W1–W4 reproduce on both revisions. External autosandbox intervention
is confirmed, and W4's active-image retention has a demonstrated release/unlink
relationship. The initiating readiness/suspension mechanism is not yet causally
closed, so these incidents remain UNRESOLVED rather than RESOLVED or
EXTERNAL / CONTAINED. No F1–F5 regression or production correction is demonstrated.
No speculative production/fixture patch, timeout increase, retry, assertion
weakening, mutation-threshold change or security bypass is justified.

This is the evidence boundary after baseline comparison, process/module/wait
tracing and one A/B/C diagnostic experiment. The smallest additional observation
is a process-creation/wait stack or equivalent security-component trace for the
exact suspended instance, identifying who suspends/resumes it and which instance
writes readiness. A separately approved, narrowly scoped security-policy comparison
could test that mechanism; globally disabling security is not a recommendation.
Do not begin another investigation or platform acceptance automatically.

Focused existing F1/F3 regressions on the independent candidate build:
`node node_modules/vitest/vitest.mjs run tests/unit/cli-run.test.ts tests/integration/stabilization.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=.test-state/lifecycle-invariants.json`:
PASS, 21 passed / 4 POSIX-only skips, exit 0, 8.52s. No production or supported
regression-test change was made. Full typecheck/lint and mutation campaigns were
not repeated for this report-only change; scoped formatting/diff checks apply.

All five hosted workflows completed successfully on the measured candidate
`7a83db2`: [Arch checks](https://github.com/Nickshajtan/hcc-harness/actions/runs/42299148697),
[Wizard](https://github.com/Nickshajtan/hcc-harness/actions/runs/42299148637),
[Quality including effects](https://github.com/Nickshajtan/hcc-harness/actions/runs/42299148638),
[Runtime portability including required aggregate](https://github.com/Nickshajtan/hcc-harness/actions/runs/42299148645),
and [Windows reliability](https://github.com/Nickshajtan/hcc-harness/actions/runs/42299148620).
Hosted success does not resolve local failures.
The report-only follow-up commit's CI must be reported separately after completion.
No production change means no new mutation campaign is applicable; no full matrix,
real inference or provider/platform acceptance pass was run.

Evidence is local and retained: worktree `.test-state/lifecycle-original.json`
reports; candidate `.test-state/diagnostic-{timeline.jsonl,results.json}`; root
`.test-state/lifecycle-*.json*` process/wait/Restart Manager/unlink records and
`lifecycle-security-*.txt` filtered security decisions. These files describe
historical identities, not ongoing termination authority. Failed fixtures
`arch-fixture-gGjsJu`, `arch-fixture-PvZv8n` and diagnostic `arch-fixture-j0WOne`
may be partially cleaned; no complete installation preservation is claimed.

## Controlled Avast protection comparison

2026-11-07; measured commit `c0dd27e03b2bb3226e4a153912c26c4846f7de99`.
The main working tree was clean before this experiment. Same Windows 10 Enterprise
10.0.19045 host, PowerShell 5.1.19041.6456, Node v24.19.0/npm 12.0.2 at
`C:/nvm4w/nodejs`, SDK 10.0.17763.0 and MSVC 14.16.27023. Checkouts remained on
`D:` and synthetic fixtures in the same local `C:/Users/38098/AppData/Local/Temp`.
Current-checkout `npm run build` and `npm run build:bootstrap` passed with the same
SDK and offline npm setting. No dependencies were downloaded. Valid measurements
used the retained isolated candidate worktree, advanced to the exact measured SHA;
its compiled application was unchanged from the preceding comparison (intervening
commits change documentation only). Its separate diagnostic test was not selected.

### Protection state and controls

Before any test, the user explicitly confirmed: “Yes, protection is temporarily
disabled.” This is **user-reported disabled**, not independently confirmed
AutoSandbox inactivity. Read-only Windows Security Center observations before,
during and after measurement reported Avast `productState=270336`, timestamp
`Sat, 07 Nov 2026 02:30:31 GMT`; this raw registration/state value was not treated
as conclusive verification of each shield. No matching AutoSandbox log entries
were found for the current-run fixture names. The historical active controls had
explicit sandbox/instrumentation decisions, as recorded above.

No security configuration, exclusion, firewall, global Arch installation or user
provider configuration was changed by the agent. `npm_config_offline=true` forced
test-created stable installations to use cached packages; host networking itself
was not disabled. Tests, production source, deadlines, fixture behavior, routing
configuration and installation layout were unchanged.

An initial invocation from the main repository root unexpectedly discovered
retained baseline/candidate worktree copies as well as the intended tests.
Two baseline-copy tests reported failures; intended current-source tests reported
passes before the run was stopped. This invocation is **INVALID for comparison**,
not a successful run or a retry-to-green result: discovery mixed revisions and
working-directory contracts. The current runner was identified and stopped; no
historical process was targeted. Its partial evidence is retained under
`.test-state/avast-disabled-1`. The isolated checkout below prevents that discovery
contamination without changing runner selection options or assertions.

### Exact valid commands and results

Working directory: `D:/AI/projects/projects/harness/.test-state/lifecycle-candidate`.
Run once with `N=1`, then the single permitted clean repetition with `N=2` after
all selected scenarios passed:

```powershell
$env:ARCH_WINDOWS_SDK='10.0.17763.0'
$env:npm_execpath=(Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules/npm/bin/npm-cli.js')
$env:MISE_BIN='D:\AI\projects\projects\harness\.tools\mise\bin\mise.exe'
$env:npm_config_offline='true'
node node_modules/vitest/vitest.mjs run tests/integration/stable-runtime.test.ts tests/integration/process.test.ts -t 'builds, installs|preserves console signals|handles real Windows Ctrl|mise activates' --maxWorkers=1 --reporter=default --reporter=json --outputFile=D:/AI/projects/projects/harness/.test-state/avast-disabled-valid-N/results.json
```

The full selected test names are unchanged from the preceding comparison:

| Scenario / test                                                                                | Historical Avast-active candidate   | User-reported disabled, first / repetition |
| ---------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------ |
| W1: handles real Windows Ctrl+C and Ctrl+Break with cleanup and no surviving native child      | FAIL, 83.530s, Native never started | PASS, 0.800s / 0.666s                      |
| W2: builds, installs, routes a controlled fixture, relocates source and safely deinitializes   | FAIL, 120.030s timeout              | PASS, 4.048s / 4.010s                      |
| W3: preserves console signals and middleware cleanup through stable project routing            | FAIL, 120.006s timeout              | PASS, 1.471s / 1.395s                      |
| W4: stable executable unlink in suite teardown                                                 | FAIL, EPERM                         | PASS / PASS, automatic fixture removal     |
| Comparator: mise activates the project-local launchers and leaves unconfigured projects native | PASS, 6.606s                        | PASS, 0.440s / 0.419s                      |

Each valid run: **4 passed, 0 failed, 21 selection skips, 2 suites passed, runner
exit 0**, no suite teardown error. W4 is a teardown outcome, not a fifth test.
Run 1: `02:51:07.528Z`–`02:51:27.258Z`, Vitest duration 19.19s.
Run 2: `02:52:02.801Z`–`02:52:22.302Z`, duration 18.89s.
These are original assertions/deadlines, not the earlier observation-only harness.

Both real control-event iterations completed: readiness existed before delivery,
middleware cleanup was observed and recorded native PIDs were no longer alive.
The original tests assert accepted Windows console status sets; their passing JSON
does not expose which accepted native/control status was returned in each case.
W2 verified direct and routed exit 7, stdin/output/arguments, source relocation,
replacement Arch runtime and deinit. Shared capture awaits direct-child `close`;
test completion and final filesystem removal establish settlement sufficiently
for these assertions, not an independent event trace of every transient descendant.

Read-only CIM sampling retained PID, parent PID, creation time, image/category and
fixture identity. Final inspection at `02:53:11.645Z` found zero remaining matching
fixture processes. Valid-run roots `arch-fixture-leQteI`, `arch-fixture-zKCxxq`,
`arch-fixture-oOrgbG`, `arch-fixture-xAoJzT` were all absent: stable executables and
their fixture trees were removed automatically. **No manual cleanup was necessary
for either valid run.** The aborted discovery run retained `arch-fixture-0Ljebm`
for diagnosis, with no matching live process; no recursive deletion was attempted.
No Restart Manager intervention was needed because unlink succeeded.

### Interpretation and merge recommendation

**CONDITIONAL GO for PR #24.** All four affected scenarios now pass twice with
automatic teardown. Combined with the repeated historical active failures and
their explicit sandbox logs, this is strong evidence that Avast protection state
affects the observed failures. It is not definitive proof that AutoSandbox alone
caused every symptom: protection was broadly user-disabled, its precise component
state was not independently verified, and this is a historical A/B comparison
rather than an interleaved A/B/A experiment. Cache/history and elapsed time are
additional uncontrolled differences. Exact suspension/readiness intervention
stacks from the active failures remain unknown.

This section updates the preceding BLOCKED recommendation based on the newly
authorized experiment; it does not relabel the historical failures as fixed by
production code. No production correction is justified. Security-disabled operation
is not an acceptable assumed long-term deployment requirement. Recommend one
separate, user-approved A/B/A confirmation after restoration if the owner needs
causal closure before merge; do not run it automatically. Compatibility with
active Avast remains a risk and the separate provider/platform acceptance passes
remain deferred. PR merge remains the owner's decision.

Evidence: `.test-state/avast-disabled-valid-{1,2}/` contains JSON results, UTC
runner bounds/exit, security snapshots, process samples and fixture identities;
`.test-state/avast-comparison-final-state.json` records process absence, artifact
removal and the targeted AutoSandbox log search. Monitoring is sampled and can
miss short-lived processes. No full suite, platform acceptance, paid inference or
mutation campaign was run; this change is documentation only.

**User action: re-enable Avast protection and verify it is active.** Restoration
was requested after testing; the agent did not configure or restore protection
and does not claim that the user has completed restoration.

## CI historical-runtime handle release correction

The Windows PR-event portability job on `17d4cdf` failed at the single-attempt
rename of `historical Node/node.exe` after real initialization:
[run 42331494591](https://github.com/Nickshajtan/hcc-harness/actions/runs/42331494591).
Eight shared-contract tests passed; the legacy-recovery case failed with `EBUSY`.
Its required aggregate failed as designed. The duplicate push-event run passed;
that did not resolve the failure. This hosted incident is distinct from the local
Avast comparison and is not attributed to Avast.

Inspection found a fixture synchronization gap. The existing `run()` awaits
ChildProcess `close` (including stdio settlement), but that event can precede
native process-handle destruction. In the exact
[Node 24.19.0 Windows implementation](https://github.com/nodejs/node/blob/v24.19.0/deps/uv/src/win/process.c),
`uv__process_close` schedules endgame; `uv__process_endgame` subsequently calls
`CloseHandle`. A copied-runtime probe observed `close` with its PROCESSWRAP still
undestroyed, then destruction later. Rename happened to pass in that probe:
an outstanding process handle does not establish the original CI lock owner.
A separate held-reader probe also showed that moving the parent directory does
not safely avoid file-sharing restrictions, so that alternative was not used.

The narrow correction adds test-only `runWithReleasedProcessHandle()`, which waits
for both existing `run()` settlement and the owned PROCESSWRAP's public
`async_hooks.destroy` notification. It captures the synchronous spawn's async ID,
ignores other resources/invocations and disables its hook on completion/failure.
Only the historical executable's real init uses this stronger barrier. Production
process handling, ordinary `run()`, ownership validation, actual executable rename,
source relocation, recovery assertions and original deadlines are unchanged.
An added ENOENT assertion verifies that the historical executable path is genuinely
unavailable before recovery. There are no sleeps, polling, deletion retries or
fallback success paths. The barrier releases this owned handle; it cannot promise
release of external readers or unknown descendants.

The new real-process regression checks native handle destruction before return,
then renames the copied executable and checks ENOENT. It **failed with the original
close-only helper** (`released=false`) in the isolated checkout, and passed with
the new barrier. This demonstrates the corrected ordering gap without claiming
that the hosted file lock was captured. Local evidence is retained in
`.test-state/ci-handle-release-before.json`, `ci-handle-release.json` and
`ci-handle-release-final.json`; the failed hosted artifact is retained in
`.test-state/ci-42331494591`.

Local checks: typecheck, scoped ESLint, scoped Prettier and diff checks passed.
The initial combined support/shared-contract run had 23 passed / 1 failed: all
15 support tests and 8 shared cases passed, including the corrected recovery case;
the remaining case failed because the local invocation omitted `ARCH_B1_MISE`.
This was a prerequisite error, not hidden as PASS. The corrected focused command,
using the existing Node 22, mise and bootstrap paths, is:

```powershell
$env:ARCH_RUNTIME_CONTRACT='1'
$env:ARCH_B1_NODE22='C:\Users\38098\AppData\Local\nvm\v22.12.0\node.exe'
$env:ARCH_B1_BOOTSTRAP='D:\AI\projects\projects\harness\.test-state\b1-bootstrap\arch-bootstrap.exe'
$env:ARCH_B1_MISE='D:\AI\projects\projects\harness\.tools\mise\bin\mise.exe'
$env:npm_execpath=(Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules/npm/bin/npm-cli.js')
$env:npm_config_offline='true'
$env:MISE_BIN=$env:ARCH_B1_MISE
node node_modules/vitest/vitest.mjs run tests/unit/support.test.ts tests/feasibility/runtime-contract.test.ts -t 'releases the owned native process handle|recovers legacy ownership|switches real mise-linked' --exclude '**/.test-state/**' --maxWorkers=1 --reporter=default --reporter=json --outputFile=.test-state/ci-handle-release-final.json
```

Corrected focused result: PASS, 3 passed / 21 selection skips, exit 0, 22.75s.
This includes a clean second successful recovery case and the actual offline mise
switching comparator with its prerequisite supplied.

The explicit exclusion prevents retained diagnostic worktrees from participating
in local test discovery; hosted checkout discovery is unchanged. No production
change or new dependency was made, so no local mutation campaign was added.
Fresh final-commit CI results are reported separately after completion. The
earlier failed run remains historical failure evidence; no assertion, job or
required check was disabled. Merge still requires passing mandatory final-head
checks and retains the Avast-active compatibility limitation documented above.

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
