# Quality baseline and remaining debt

Baseline: `3e86a4b22388cb0cc7faeff744ec17e967c6224b`, main after M2.4.2.
Measurements are executed Windows x64 / Node 24.19.0 results unless identified
otherwise. Final revision and current CI are in [PR #13](https://github.com/Nickshajtan/hcc-harness/pull/13).
Human comprehension and preserved contracts take priority over metrics.

## Tools and commands

Pins unchanged: TypeScript 6.0.3, ESLint 10.12.0, typescript-eslint 8.71.2,
Prettier 3.9.10, Vitest/V8 5.0.5, Stryker core/runner 10.1.1,
dependency-cruiser 18.7.0. No dependency, override or lockfile change.

Run `npm run check`, `npm run lint:report`, `npm run report:dependencies`,
`npm run test:coverage`, `npm run test:mutation`, `npm run test:mutation:core`,
`npm run test:mutation:lifecycle`, `npm run test:mutation:process`,
`npm run test:mutation:check`, `npm run test:acceptance`, `npm run test:wizard`.
Machine-readable reports live under coverage/ and reports/mutation*.

## Reproduced measurements

| Measurement                                   |                 Starting main |               Measured result |
| --------------------------------------------- | ----------------------------: | ----------------------------: |
| Ordinary lint errors / warnings               |                       0 / 116 |                       0 / 105 |
| Analysis warnings including metrics           |                           165 |                           142 |
| Complexity / depth / params / length findings |              11 / 18 / 3 / 17 |               8 / 11 / 3 / 15 |
| Global V8 lines                               |              78.06% (669/857) |              83.04% (730/879) |
| Global V8 branches                            |              70.67% (417/590) |              76.21% (455/597) |
| Process V8 lines                              |               68.29% (84/123) |                100% (140/140) |
| Process V8 branches                           |                62.06% (54/87) |                97.82% (90/92) |
| Dependency graph                              |  39 modules / 98 dependencies | 44 modules / 114 dependencies |
| Cycles / violations                           |                         0 / 0 |                         0 / 0 |
| Process maximum complexity / nesting          |                        16 / 5 |                         8 / 3 |
| Process maximum function length               | 132 nonblank/noncomment lines |                            37 |
| Process maximum parameters                    |                             5 |      5 (unchanged public API) |
| Process functions / classes / physical lines  |                  15 / 0 / 218 |                  24 / 1 / 312 |

Full check: 331 passed / 31 explicit skips, 88.83s; gated coverage: same tests,
112.34s. A subsequent file-handle characterization adds one test. Starting main:
258 / 30 skips, 98.15s; coverage 105.63s. Windows skips include a new POSIX permission
case; POSIX skips the new actual-Windows PATHEXT case. Mandatory shared runtime tests
permit no skips. Times reflect concurrent load, not performance benchmarks.
Final-head counts are in the PR.

All five process files now enforce >=95% lines / >=90% branches. Child lifecycle,
environment and launch: 100% / 100%; resolver: 100% / 96.15%; shim: 100% / 95%.
CLI/commands remain 0% in worker V8 despite real subprocess tests. No production
source is excluded; global targets remain debt outside achieved scopes.

## Responsibility and contract review

Before: process.ts mixed router detection, PATH/PATHEXT lookup, npm adaptation,
native Node selection, spawn, cancellation, escalation and settlement. Now its
export-only facade preserves every public name and LaunchResult. Five internal
modules own environment, resolver, Windows shim, launch and child lifecycle.
One ChildExecution owns per-child state/listeners/timer; stateless policies remain
functions. See the [map](../architecture.md#processes-and-platforms). More imports and
functions expose responsibilities; no claim of fewer lines or lower raw coupling.

Characterization preceded extraction: immutable argv/env, inherited streams,
shell:false, signal policy, concurrent isolation, callback races, PATH precedence,
empty/relative entries, files/permissions/aliases and PATHEXT. Shim tests protect
adjacent/PATH Node, recursion, anchors/spacing, invalid targets and preparation abort.
Resource assertions cover exactly-once disposal, unref/escalation, error identity
and actual FileHandle.close. Real Windows npm/console, subprocess, terminal and
interruption tests remain authoritative; platform simulations supplement them.

## Mutation baseline

All process implementation modules are mutated in full. No mutator/range exclusions.
Counts below are assertion kills; timeouts earn no credit.

| Process scope   | Total | Windows killed / survived / uncovered | Ubuntu killed / survived / uncovered | Gate |
| --------------- | ----: | ------------------------------------: | -----------------------------------: | ---: |
| Child lifecycle |   101 |                  100 / 1 / 0 (99.01%) |                 100 / 1 / 0 (99.01%) |  90% |
| Resolver        |    84 |                   76 / 8 / 0 (90.48%) |                  75 / 9 / 0 (89.29%) |  85% |
| Launch          |    17 |                   16 / 1 / 0 (94.12%) |                  16 / 1 / 0 (94.12%) |  85% |
| Environment     |    38 |                   37 / 1 / 0 (97.37%) |                  37 / 1 / 0 (97.37%) |  90% |
| Windows shim    |    79 |                   73 / 5 / 1 (92.41%) |                  76 / 2 / 1 (96.20%) |  90% |

Windows: 302/319, 94.67%, zero timeouts/errors, 272s. Ubuntu: 304/319, 95.30%,
zero timeouts/errors, later shim assertions. Initial pilot: 249 killed / 47 survived /
6 uncovered / 8 timeouts, 310 total, 80.32% assertion-only versus 82.90% Stryker, 380s.
Second: 293/319, 91.85%, zero timeouts/errors, 283s. Real disposal/cancellation/lookup
gaps were closed; scope did not shrink. Gates followed executed measurements.

Survivors reviewed: selecting SIGTERM equals its fallback; empty read encoding yields
equivalent regex string coercion; code-less errno fallback literals stay outside miss
codes. String.split always returns an element, so the empty shebang fallback is
unreachable (one uncovered mutant). Platform/access and PATH casing differ by host.
Later mixed-case resolver and actual handle-close assertions address genuine Ubuntu
survivors; final artifacts record their effect. Missing-PATH mutants can invent a
speculative directory: retain the real missing/empty PATH contract without manufacturing
mutant-specific fixtures.

| Existing scope           | Windows killed / total | Assertion-only | Other outcomes                                           |
| ------------------------ | ---------------------: | -------------: | -------------------------------------------------------- |
| Config                   |                  87/93 |         93.55% | 1 survivor, 5 timeouts; Stryker 98.92%                   |
| Core index / environment |             18/18 each |           100% | none                                                     |
| Core failures            |                  19/20 |            95% | equivalent initial-stage survivor                        |
| Core session             |                  59/62 |         95.16% | 1 survivor / 2 uncovered defensive branches              |
| Middleware               |                  92/96 |         95.83% | 4 survivors; Ubuntu 90 killed / 5 survived / 1 uncovered |
| Events                   |                  15/15 |           100% | none                                                     |
| Manifest                 |                183/193 |         94.82% | 8 survived / 2 uncovered; Ubuntu 180/193                 |
| Ownership                |                  39/39 |           100% | none                                                     |
| Journal                  |                115/117 |         98.29% | 2 survivors                                              |
| Recovery validation      |                  48/48 |           100% | none                                                     |

Lifecycle: 385/397, 96.98%, zero timeouts/errors, 267s under load. Core counts match
starting main exactly; latest run 173s versus baseline 63s. Config took 45s.
The hosted quality job ran all four pilots in 132s and the job in 170s.
Existing 15-minute budget and three-platform workflows are unchanged.

## Debt disposition and enforcement

FIX NOW: journal JSON now enters as unknown with structural/payload narrowing;
129 old/new outcomes matched metadata/order, errors and diagnostics. Historical
acceptance was not strengthened. Two inspection/removal assertions use named recorded
bytes; staging index conversion preserves bytes; wizard close uses an explicit void
block. TTY coercions were redundant in a truthiness-only predicate; noninteractive
undefined remains falsey. Renderer location/import.meta.url and recovery ordering remain.

Promoted globally: prefer-optional-chain, no-confusing-void-expression,
no-unnecessary-type-conversion. Production no-unnecessary-condition and
Core/lifecycle/process no-non-null-assertion now block. Ratchet only pruned.
105 remaining warnings: 34 non-null, 26 unsafe member, 10 unsafe assignment,
8 unsafe argument, 7 unnecessary condition, 6 template, 4 each plus operands,
nullish and empty function, 2 unsafe return. Only two wizard non-null findings remain
in production; the rest are test-boundary debt. Identical-context fingerprint limits remain.

DEFER: wizard desiredRoutes/status typing; cohesive subprocess JSON boundary validation;
correlated event generic assertions; Core defensive infrastructure survivors;
lifecycle effect/planning/init/removal mutation; CLI subprocess instrumentation;
setup renderer relocation/B2. Commands/wizard workflow complexity is next.
REJECT: broad disables, impossible mutant-specific states, arbitrary thresholds,
generic process frameworks, renderer URL moves or weakened recovery.

Security audit (2026-10-30): two moderate vulnerable dev dependency entries through
Stryker 10.1.1 -> typed-rest-client 2.3.1 -> qs 6.15.1. Registry inspection found no
newer compatible typed-rest-client 2.x; it pins qs. No forced major update, override
or audit disabling. TLS succeeded using Node's system CA store. This is not a clean
audit. Native production execution does not import Stryker.

## Executed evidence and limits

PASS: check, lint/ratchet/report, dependency rules/report, gated coverage, all four
mutation pilots/checker, acceptance, wizard (14 unit / 13 real terminal scenarios),
public exports, journal differential check and frozen M1 hash.
Frozen blob: `2748032203bc587d465543e1e2d1317d13a8a4f4`.
Core/middleware/events/config/setup/vendor/frozen fixtures/lockfile are unchanged.

At implementation `e50e00e`, inspected hosted jobs/artifacts passed:
[regression](https://github.com/Nickshajtan/hcc-harness/actions/runs/40983010383),
[wizard](https://github.com/Nickshajtan/hcc-harness/actions/runs/40983010328),
[runtime and required aggregate](https://github.com/Nickshajtan/hcc-harness/actions/runs/40983010438),
[quality](https://github.com/Nickshajtan/hcc-harness/actions/runs/40983010385).
Windows artifact: 287 unit / 42 integration / 1 acceptance passed; real npm
PATH/adjacent selection, arguments/exit, Ctrl+C/Ctrl+Break and recovery passed.
Ubuntu quality: 326 passed / 33 explicit platform/opt-in skips, coverage 83.04% /
76.71%, all areas PASS. Later revisions need their own checks; final results are in
the PR. Required status name and protection remain unchanged.

Known limits: sandbox taskkill required unchanged elevated mutation reruns; existing
.tools junction warnings are nonfatal with valid reports and zero mutation errors.
Windows ARM64, every terminal emulator, hostile filesystem races, power-loss durability
and full-repository mutation remain NOT TESTED. B1 stays feasibility; B2 and CLI/Wizard
refactoring remain separately gated.
