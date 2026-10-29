# Quality baseline and remaining debt

This is a maintained baseline. Current refactor starts at
`86eeb4c8de7235b00a8066e12339db385d9cb73b` (main after M2.4.1).
Core consolidation: `a5418ce`; lifecycle extraction: `0910080`; characterization:
`b1894b6` and `bcbbbba`; mutation integration: `d04cae2`. Final documentation/evidence
commit is recorded in the PR. Measurements below are executed Windows x64 results on Node 24.19.0;
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
  `npm run test:mutation:lifecycle`, `npm run test:mutation:check`: Config, complete Core
  and complete manifest/ownership/journal/recovery-validation scopes;
  JSON/HTML under reports/mutation, reports/mutation-core and reports/mutation-lifecycle.
- `npm run test:acceptance`, `npm run test:wizard`: real routing and terminal contracts.

## Reproduced before / after

| Measurement                                   |                  Starting main |                               Current local result |
| --------------------------------------------- | -----------------------------: | -------------------------------------------------: |
| Ordinary lint errors / warnings               |                        0 / 116 |      0 / 116; only existing fingerprints relocated |
| Analysis warnings including metrics           |                            167 |                                                165 |
| Complexity / depth / params / length findings |               12 / 18 / 3 / 18 |                                   11 / 18 / 3 / 17 |
| Global V8 lines                               |               76.26% (649/851) |                                   78.06% (669/857) |
| Global V8 branches                            |               68.47% (404/590) |                                   70.67% (417/590) |
| Lifecycle + setup lines                       |               91.64% (329/359) |                                   95.61% (349/365) |
| Lifecycle + setup branches                    |               86.21% (225/261) |                                   91.18% (238/261) |
| Ordinary tests                                | 181 passed / 30 existing skips |                         258 passed / same 30 skips |
| Dependency graph                              |   28 modules / 51 dependencies | 39 modules / 98 dependencies; no cycles/violations |

Coverage took 54.50 seconds with other work running. The final full check passed
258 tests in 49.43 seconds; an earlier run took 97.37 seconds under heavier concurrent
load. These are observed times, not performance benchmarks.
All four Core responsibility gates retained their exact counts after consolidation:
114/118 assertion kills, 96.61%, zero timeouts/errors. Config remains 87 killed,
1 survivor, 5 timeouts (93.55% assertion-only); Middleware 92/96 and Events 15/15.

## Lifecycle responsibilities and current evidence

Before: lifecycle.ts combined manifest layout, journal parsing, staging/publication,
recovery validation/effects, planning, public operations and status observations;
setup.ts combined renderer/init, manifest parsing, safe reads, hashes and uninstall.
Now `lifecycle.ts` and `core.ts` forward existing public exports. `core/` groups its
four responsibility files. `setup.ts` retains initialization and import-relative
launcher rendering; `lifecycle/` has ten cohesive modules described in the
[architecture map](../architecture.md#m2-project-lifecycle). No new classes or
generic transaction/filesystem abstractions. Five focused local helpers separate
journal header/file validation and inspection ownership/activation/config diagnostics.

The original lifecycle maximum complexity was 26, nesting 3, function length 107
nonblank/noncomment lines; across its replacements the maxima are 14, 3 and 47.
Journal parsing decreased from complexity 20 to at most 9 across its helpers.
Inspection decreased from 26 to at most 13 across its helpers. Recovery effect
ordering (complexity 14), recovery validation (13), setup (15 / 72 lines) and
uninstall (14) retain their deliberate coordination debt. Setup/removal were not
reordered to lower metrics. Whole-subsystem nesting remains 3; maximum complexity
falls from 26 to 15 and function length from 107 to 72. The original files totaled
754 physical lines; extraction adds import/type boundaries and five helpers rather
than reducing total text. Dependency count also increases; no claim of lower raw coupling.

Characterization established before extraction: exact checkpoint sequence,
retained launcher bytes, unchanged-route no-op, read-only inspection/orphan-stage
refusal, modified retained-file recovery refusal and historical metadata/order.
New focused tests cover journal headers/payloads, mixed layouts, invalid paths and
digests, symlinks, absent versus changed resources, bootstrap mismatch, conflicts,
private-stage corruption and validation idempotency. Rollback tests preserve reverse
deletion and current cleanup-error precedence; rename failure retains uninstall
ownership. Public runtime export names are asserted. Frozen M1 source is unchanged.
An AST comparison of 18 original function bodies found no changes beyond formatting
and comments, including renderer, init, uninstall, route planning and recovery effects.

Real Windows interruption coverage now has 18 scenarios: all existing checkpoints
plus test-only filesystem boundaries before journal publication, partial private
write, before removals, stage cleanup and after journal removal, plus exe/shim
staging/publication/removal. Parent processes force-kill actual workers. Partial
bytes are retained until explicitly restored by the fixture owner; orphan staging
requires explicit fixture removal. No new production checkpoints or retry logic.

| Decision scope      | Total | Killed | Survived | Uncovered | Timeout | Errors | Assertion-only |
| ------------------- | ----: | -----: | -------: | --------: | ------: | -----: | -------------: |
| manifest            |   193 |    183 |        8 |         2 |       0 |      0 |         94.82% |
| ownership           |    39 |     39 |        0 |         0 |       0 |      0 |           100% |
| routing journal     |    92 |     90 |        2 |         0 |       0 |      0 |         97.83% |
| recovery validation |    48 |     48 |        0 |         0 |       0 |      0 |           100% |

Pilot: 74 tests, 115 seconds while other suites ran. Total 360/372 assertion kills,
96.77%; no excluded mutators/branches. The initial pilot was 337/369, 91.33%; useful
digest anchors, mixed pairs and default identity assertions killed genuine gaps.
Gates: manifest/journal 85%, ownership/recovery validation 90%. All four also meet
and enforce 95% line / 90% branch coverage. Existing gates remain unchanged.

Survivors reviewed: platform-constant identity/default mutants are equivalent on
one host and require the other platform; upper/lower casing gives equivalent
duplicate detection; number-to-string digest coercion and numeric UUID IDs outside
the validated domain retain type-check mutants; regex prefix mutants encounter
later route-name validation; a duplicate-Windows-route branch is unreachable after
validateCommands already rejects duplicates (two uncovered mutants). The journal
path constant is not used by the pure journal pilot, although real integration
tests verify that exact on-disk path. No exclusions were added. Effect coordinators,
routing planning and initialization/removal mutation remain NOT TESTED by this
focused pilot; real filesystem and interruption tests cover those contracts.

Remaining readability debt: original typed assertion at the journal JSON boundary,
two non-null assertions justified by surrounding state checks, numeric staging-name
interpolation, and the explicitly listed coordinator complexity. These findings
were moved in the warning baseline without rule/message/context changes. No broad
suppression or new warning fingerprint was accepted. Dependency rules now reject
back-imports from manifest/ownership/journal into lifecycle/setup coordinators.

Readability review: public operations start at lifecycle/index.ts; recorded paths
and hashes at manifest/ownership; route classification at routing-plan; on-disk
recovery permission at recovery-validation; exact writes/deletes/checkpoints at
recovery; inspection never calls mutators. Renderer location is unchanged to keep
captured CLI/vendor paths identical. Recovery order is visible top-to-bottom.

The first baseline mutation attempt hit sandbox-denied Windows taskkill; an
unchanged elevated rerun completed (79 seconds), and relocated Core completed in
64 seconds. Existing Stryker node_modules junction warnings remain nonfatal; valid
reports contain zero infrastructure errors. No dependency/security changes.

## Core gates and remaining debt

Core facade, environment and failure policy remain 100% lines/branches; session
98.21%/91.66%. The combined scope remains 98.75% lines / 96.29% branches. Mutation:
facade 18/18, environment 18/18, failures 19/20, session 59/62 assertion kills.
Session survivors/uncovered cases remain redundant terminal-result guarding and
defensive finalize-hook infrastructure rejection. Failure collector initial-stage
label is overwritten on the first failure. No moved source was dropped from gates.

Config >=90%, Middleware >=85%, Events >=95% and each Core file >=85% assertion-only
gates are unchanged. Ordinary observer failures remain isolated. Terminal publication
infrastructure failure still takes precedence while disposing the bus. Core's two
stateful objects remain execution-local; process/middleware/event implementations
and public contracts were not changed.

CLI/commands remain 0% under ordinary worker V8 coverage despite real subprocess
tests. Prior autoAttachSubprocess experiments could not collect isolated environments;
no runtime environment injection or artificial private-helper tests were added.
Global targets remain debt outside the measured enforced scopes. Process native
resolution/cancellation and commands/wizard remain separately authorized future
refactoring candidates. Initialization/removal and routing effect mutation can expand
after its cost and isolation are measured; do not replace real interruption tests.

The warning ratchet still tracks file/rule/message/context and multiplicity rather
than numeric line shifts; identical contexts remain indistinguishable. No new
dependency or override. Existing dev-only Stryker -> typed-rest-client -> qs moderate
advisories remain unresolved from the security baseline; no new clean-audit claim.

## Cross-platform evidence

Starting main at 86eeb4c has inspected successful
[regression](https://github.com/Nickshajtan/hcc-harness/actions/runs/40966026432),
[wizard](https://github.com/Nickshajtan/hcc-harness/actions/runs/40966026579) and
[runtime portability](https://github.com/Nickshajtan/hcc-harness/actions/runs/40966026457)
workflow conclusions. Refactor CI evidence is recorded in the dedicated PR after
inspection; current-head hosted validation is still NOT TESTED at this local checkpoint.
The required aggregate name and branch protection remain unchanged. Windows ARM64,
every terminal emulator, power-loss durability, hostile filesystem races and full
repository mutation remain NOT TESTED. B2 and process refactoring are outside scope.
