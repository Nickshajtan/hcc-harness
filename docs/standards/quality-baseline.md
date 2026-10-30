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
| Ordinary lint errors / warnings               |                       0 / 116 |                        0 / 87 |
| Analysis warnings including metrics           |                           165 |                           124 |
| Complexity / depth / params / length findings |              11 / 18 / 3 / 17 |               8 / 11 / 3 / 15 |
| Global V8 lines                               |              78.06% (669/857) |              83.06% (731/880) |
| Global V8 branches                            |              70.67% (417/590) |              76.21% (455/597) |
| Process V8 lines                              |               68.29% (84/123) |                100% (141/141) |
| Process V8 branches                           |                62.06% (54/87) |                97.82% (90/92) |
| Dependency graph                              |  39 modules / 98 dependencies | 44 modules / 114 dependencies |
| Cycles / violations                           |                         0 / 0 |                         0 / 0 |
| Process maximum complexity / nesting          |                        16 / 5 |                         8 / 3 |
| Process maximum function length               | 132 nonblank/noncomment lines |                            37 |
| Process maximum parameters                    |                             5 |      5 (unchanged public API) |
| Process functions / classes / physical lines  |                  15 / 0 / 218 |                  24 / 1 / 317 |

Full check: 334 passed / 31 explicit skips, 53.53s; gated coverage passed the same
tests in 62.37s. Starting main:
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
| Resolver        |    84 |                   76 / 8 / 0 (90.48%) |                  80 / 4 / 0 (95.24%) |  85% |
| Launch          |    18 |                   17 / 1 / 0 (94.44%) |                  17 / 1 / 0 (94.44%) |  85% |
| Environment     |    38 |                   37 / 1 / 0 (97.37%) |                  37 / 1 / 0 (97.37%) |  90% |
| Windows shim    |    79 |                   77 / 1 / 1 (97.47%) |                  77 / 1 / 1 (97.47%) |  90% |

Windows: 307/320, 95.94%, and Ubuntu: 311/320, 97.19%; zero timeouts/errors.
The Windows pilot took 257s. Initial pilot: 249 killed / 47 survived /
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
starting main exactly; latest run 78s versus baseline 63s. Config took 45s.
The hosted quality job ran all four pilots in 151s and the job in 200s.
Existing 15-minute budget and three-platform workflows are unchanged.

## Debt disposition and enforcement

FIX NOW: journal JSON now enters as unknown with structural/payload narrowing;
129 old/new outcomes matched metadata/order, errors and diagnostics. Historical
acceptance was not strengthened. Two inspection/removal assertions use named recorded
bytes; staging index conversion preserves bytes; wizard close uses an explicit void
block. TTY coercions were redundant in a truthiness-only predicate; noninteractive
undefined remains falsey. Renderer location/import.meta.url and recovery ordering remain.

Additional fixture fixes: explicit UTF-8 Buffer decoding, runtime-copy tuple typing,
numeric diagnostic conversion and validated partial-stage journal payloads. Empty
MISE_BIN/SystemRoot still select their existing fallbacks; intentional no-op test
handlers remain explicit debt rather than receiving filler code to satisfy metrics.

Promoted globally: prefer-optional-chain, no-confusing-void-expression,
no-unnecessary-type-conversion and restrict-template-expressions. Test plus operands
are also errors now. Production no-unnecessary-condition and
Core/lifecycle/process no-non-null-assertion now block. Ratchet only pruned.
87 remaining warnings: 32 non-null, 24 unsafe member, 9 unsafe assignment,
7 unsafe argument, 7 unnecessary condition, 2 each unsafe return/nullish, and
4 intentional empty functions. Only two wizard non-null findings remain
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

At implementation `e4a087e`, inspected hosted jobs/artifacts passed:
[regression](https://github.com/Nickshajtan/hcc-harness/actions/runs/41036503296),
[wizard](https://github.com/Nickshajtan/hcc-harness/actions/runs/41036503173),
[runtime and required aggregate](https://github.com/Nickshajtan/hcc-harness/actions/runs/41036503097),
[quality](https://github.com/Nickshajtan/hcc-harness/actions/runs/41036503277).
Windows artifact: 290 unit / 42 integration / 1 acceptance passed; real npm
PATH/adjacent selection, arguments/exit, Ctrl+C/Ctrl+Break and recovery passed.
Ubuntu quality: 329 passed / 33 explicit platform/opt-in skips, coverage 83.06% /
76.71%, all areas PASS. Later revisions need their own checks; final results are in
the PR. Required status name and protection remain unchanged.

One local full run returned uninstall code 1 immediately after a native fixture ran;
its stderr was not retained by the old assertion. The assertion now reports stderr.
Targeted tests, 30 immediate init/run/uninstall sequences without retries, and the
full 334-test run passed afterward. The original intermittent cause remains
unconfirmed; no production retries, sleeps or weaker assertions were introduced.
This remains diagnostic debt rather than a claimed filesystem-sharing diagnosis.

Known limits: sandbox taskkill required unchanged elevated mutation reruns; existing
.tools junction warnings are nonfatal with valid reports and zero mutation errors.
Windows ARM64, every terminal emulator, hostile filesystem races, power-loss durability
and full-repository mutation remain NOT TESTED. B1 stays feasibility; B2 and CLI/Wizard
refactoring remain separately gated.
