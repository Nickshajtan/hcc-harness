# Quality baseline and remaining debt

This is a maintained baseline, not a milestone history. Starting commit:
`b4e911b692e89ad4fd9d658b6f192b8ff17fc180` (current main after M2.3.1).
Core responsibility refactor: `4b6254d`; final gate/documentation commit is recorded
in the PR. Measurements below are executed Windows x64 results on Node 24.19.0;
hosted results are identified separately. No production dependency, public contract,
launcher, ownership/journal format or process policy changes.

## Tools and reproducible checks

Pinned tools remain TypeScript 6.0.3, ESLint 10.12.0, typescript-eslint 8.71.2,
Prettier 3.9.10, Vitest/V8 5.0.5, Stryker core/runner 10.1.1 and
dependency-cruiser 18.7.0. No dependencies were added or updated.

- `npm run check`: formatting, types, lint, context-based warning ratchet, tooling
  tests, dependency checks, build and ordinary regression.
- `npm run lint:report` / `npm run report:dependencies`: JSON under reports/.
- `npm run test:coverage`: V8 JSON/summary/HTML/LCOV plus test JSON under coverage/.
- `npm run test:mutation`, `npm run test:mutation:core`,
  `npm run test:mutation:check`: config and complete Core responsibility scopes;
  JSON/HTML under reports/mutation and reports/mutation-core.
- `npm run test:acceptance`, `npm run test:wizard`: real routing and terminal contracts.

## Reproduced before / after

| Measurement                                   |                  Starting main |      Refactored local result |
| --------------------------------------------- | -----------------------------: | ---------------------------: |
| Ordinary lint errors / warnings               |                        0 / 118 |                      0 / 116 |
| Analysis warnings including metrics           |                            172 |                          167 |
| Complexity / depth / params / length findings |               13 / 19 / 3 / 19 |             12 / 18 / 3 / 18 |
| V8 lines                                      |               75.56% (631/835) |             76.26% (649/851) |
| V8 branches                                   |               67.95% (403/593) |             68.47% (404/590) |
| V8 statements / functions                     |                75.81% / 88.09% |              76.46% / 89.20% |
| Ordinary tests                                | 167 passed / 30 existing skips |   181 passed / same 30 skips |
| Dependency graph                              |   25 modules / 44 dependencies | 28 modules / 51 dependencies |

The full check passed in 38.26 seconds; coverage in 79.51 seconds while other work
was running. These are observed durations, not isolated performance comparisons.
Acceptance: 1 real routing workflow PASS. Wizard: 14 unit tests and 13 real-terminal
scenarios PASS. Quality tooling: 9 tests PASS, including negative tests proving the
new execution mutation gates reject surviving-only reports.

## Core responsibility boundaries and readability

Previously execute() combined discovery, immutable context creation, observer setup,
factory activation, lifecycle phases, Windows environment replacement, launch,
failure accumulation, finalization and terminal events. It had complexity 23,
maximum block depth 4 and 108 nonblank/noncomment function lines.

Now core.ts retains discovery/passthrough and delegates configured execution to
execution-session.ts. The session owns one pipeline/bus/result/stage; execution-failures.ts
owns ordered error identity and precedence; execution-environment.ts is a pure
composition policy. Three new internal abstractions: two classes and one function.
No inheritance, DI container, process adapter or circular barrel exports.

execute() has complexity 5, depth 1 and 21 function lines. Across all four execution
files the maximum function complexity is 6 (middleware activation), block depth 2,
function length 21 and parameter count 4. The session's run() has complexity 2 and
15 lines. These measurements include the helpers; complexity was not merely hidden
behind the facade. The total implementation is longer because responsibilities and
failure boundaries are named. Metrics alone do not prove readability.

Human comprehension review: PASS. Start/discovery/passthrough are in execute();
factory selection is registerMiddleware(); phase order and native launch are in
runNativeLifecycle(); environment replacement is composeLaunchEnvironment(); primary
stage/error selection is ExecutionFailures.record(); finalization then cleanup is
finalize(); terminal publication and bus disposal are publishTerminalEvent().
The architecture document contains the maintained contract map.

## Behavioral and coverage evidence

Characterization tests passed against the old implementation before extraction.
New contracts cover launch-stage cancellation with original AbortSignal/error identity,
reverse-order compound cleanup failures, real spawn ENOENT after resolution,
terminal completed/failed publication infrastructure rejection with listener disposal,
invalid configuration before observer initialization, ambient environment fallback,
and registry selection after awaited execution.started observers.

Real subprocess tests verify empty overrides, Windows case-insensitive replacement,
POSIX case-sensitive preservation and unchanged caller environment. Pure policy tests
exercise both platform branches deterministically; those simulations are not Windows
runtime evidence. Existing concurrent subprocess/environment tests remain intact.
Failure-policy tests preserve unknown thrown values, cause and ordered secondaries.

| Scope                          | Before lines / branches | After lines / branches |
| ------------------------------ | ----------------------: | ---------------------: |
| Core combined responsibilities |          95.31 / 83.33% |         98.75 / 96.29% |
| core.ts facade                 |          included above |             100 / 100% |
| execution-session.ts           |          included above |         98.21 / 91.66% |
| execution-failures.ts          |          included above |             100 / 100% |
| execution-environment.ts       |          included above |             100 / 100% |
| config.ts                      |              100 / 100% |              unchanged |
| events.ts                      |              100 / 100% |              unchanged |
| middleware.ts                  |            100 / 95.83% |              unchanged |

Combined Core counts are 79/80 lines and 26/27 branches across facade and all three
extractions. Per-file gates now enforce >=95% lines / >=90% branches for every Core
responsibility as well as the existing config/events/middleware gates. No source is
excluded. The defensive finalize-hook infrastructure rejection remains uncovered;
normal finalizer errors are collected by the pipeline and asserted through disposal.

Other measured files remain process 68.29/62.06%, lifecycle 92.08/84.39%, setup
90.75/89.77%, discovery 90.90/90.90%, demo 71.42/50%, wizard 70.83/72.54%.
CLI/commands remain 0% in ordinary V8 instrumentation despite real contract tests.
The previous executed autoAttachSubprocess experiment left them at 0% because
isolated fixtures omit NODE_V8_COVERAGE. No runtime environment injection or artificial
private-helper tests were introduced to improve this number.

## Mutation evidence and enforcement

The starting execution pilot was rerun before refactoring: Core 78 killed / 18
survived / 7 uncovered (75.73%); middleware 92 killed / 4 survived (95.83%);
events 15 killed (100%). It took 52 seconds. The new pilot mutates every extracted
Core responsibility, unchanged middleware/events, with no mutator exclusions.

| Scope                 | Total | Killed | Survived | Uncovered | Timeout | Errors | Score / assertion-only |
| --------------------- | ----: | -----: | -------: | --------: | ------: | -----: | ---------------------: |
| config                |    93 |     87 |        1 |         0 |       5 |      0 |         98.92 / 93.55% |
| core facade           |    18 |     18 |        0 |         0 |       0 |      0 |             100 / 100% |
| execution session     |    62 |     59 |        1 |         2 |       0 |      0 |         95.16 / 95.16% |
| execution failures    |    20 |     19 |        1 |         0 |       0 |      0 |               95 / 95% |
| execution environment |    18 |     18 |        0 |         0 |       0 |      0 |             100 / 100% |
| middleware            |    96 |     92 |        4 |         0 |       0 |      0 |         95.83 / 95.83% |
| events                |    15 |     15 |        0 |         0 |       0 |      0 |             100 / 100% |

Combined Core: 114 assertion kills / 118 mutants = **96.61%**, up from 75.73%.
Mutation denominators change with the implementation; this is evidence of protected
responsibilities, not an identical-mutant comparison. Expanded pilot: 42 focused tests,
91 seconds (overlapped with coverage); config: 5 tests, 23 seconds.

Gates now require >=85% assertion kills for each of the four execution files.
Config >=90%, middleware >=85% and events >=95% are unchanged. Missing files/reports,
ignored mutants and compile/runtime errors fail. Timeouts never count as assertion
kills. A negative tooling test exercises every new gate.

Survivor review: the session's terminal-result guard is redundant after a successful
launch under the established LaunchResult contract; it remains visible, not excluded.
Two uncovered mutants concern finalize hook-dispatch infrastructure rejection. The
failure collector's initial registration label is overwritten when recording the first
error; its empty-string mutation is equivalent for valid transitions. Middleware's
four survivors retain unsupported runtime type input, platform key identity, phase
reset and hook removal characterization debt. Config retains a redundant valid-TOML
prefix check and five loop/progress timeouts; these are not semantic assertion kills.
Ownership/recovery and broad process mutation remain NOT TESTED and outside this refactor.
Local Stryker still emits pre-existing .tools node_modules junction warnings, but
workers complete and validated reports contain zero execution errors.

## Static enforcement, dependencies and remaining work

The warning ratchet is unchanged: file/rule/message/context plus duplicate multiplicity,
ignoring numeric line shifts. Only the resolved dynamic-delete and result non-null
assertion entries were pruned. No snapshot additions, suppressions or source exclusions.
Identical contexts remain indistinguishable; this is not semantic-diff enforcement.
Remaining warnings concern legacy assertions, conditions and test boundaries described
by visible ESLint diagnostics. Core and all extracted modules have zero ordinary or
complexity review findings. Existing typed rule severities remain intact.

Dependency-cruiser finds zero cycles/violations. Presentation restrictions include all
three internal execution modules; no imaginary pure layering is claimed. Core delegates
to session, which composes existing config types, middleware, events and process.
The failure collector has no imports; environment composition has no process-launch
imports. Existing dynamic registries/native fixtures still make automatic Knip deletion
inappropriate; no new tool or dead-code removal was introduced.

Known dev-only Stryker -> typed-rest-client -> qs moderate advisories remain unresolved
from M2.3.1; no dependency changes or new clean-audit claim. Process/native runtime
selection, routing/recovery, manifests and middleware/event infrastructure are unchanged.

Next separately authorized work should prioritize ownership/recovery failure boundaries,
then native resolution/cancellation, retaining interruption/console tests. Lifecycle
inspection (complexity 26), journal parsing (20), process resolution (16), launch (15),
setup (15), uninstall (14), commands (37) and wizard (27) remain structural debt.
B2, Windows ARM64, every terminal emulator and full-repository mutation remain NOT TESTED.

## Cross-platform CI evidence

Starting main inspected PASS: [regression](https://github.com/Nickshajtan/hcc-harness/actions/runs/40956631811),
[wizard](https://github.com/Nickshajtan/hcc-harness/actions/runs/40956631709),
[runtime and required aggregate](https://github.com/Nickshajtan/hcc-harness/actions/runs/40956631899).
At validated code/tooling commit `ae13be0ee955247ab4f07cf02e2cddd8afc06792`,
all PR matrices were inspected PASS: [regression](https://github.com/Nickshajtan/hcc-harness/actions/runs/40960531146),
[wizard](https://github.com/Nickshajtan/hcc-harness/actions/runs/40960531220),
[runtime and required aggregate](https://github.com/Nickshajtan/hcc-harness/actions/runs/40960531294),
[quality measurements](https://github.com/Nickshajtan/hcc-harness/actions/runs/40960531363).
Downloaded quality JSON confirms lint/dependency/coverage/mutation PASS, 116 legacy
warnings and 51 metric findings. Hosted Ubuntu coverage is 75.79% lines / 67.45%
branches, 178 passed / 32 existing skips. The four Core mutation counts match the
Windows table; middleware is 90 killed / 5 survived / 1 uncovered (93.75%) due to
platform reachability, with zero errors. Quality job: 90 seconds.

A separate push run at the identical commit failed Windows temporary historical-Node
rename with EBUSY before relocation/recovery assertions. The PR run passed the same
scenario. The lock owner is unproven; this is retained as a Windows fixture stability
risk, not called a Core defect or hidden as a passing attempt. See [push evidence](https://github.com/Nickshajtan/hcc-harness/actions/runs/40960429126).
The single manual failed-job rerun passed unchanged, including the required aggregate.
No retry loop, increased timeout, skipped test or weakened assertion was added.
Required runtime workflow/aggregate and branch protection are unchanged. Mutation
selection includes the new policy tests and all production source. Reports remain
fail-closed with PASS / FAIL / NOT TESTED and visible skips/timeouts.
