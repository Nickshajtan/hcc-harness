# Quality baseline and refactoring backlog

Human Comprehensibility First. This maintained baseline identifies evidence and debt;
it does not authorize Structural Refactoring or M2.2 B2.

Starting commit: `9c7ea4fec83a32c0566710c7a6d8ae9144615125` (main after PR #9).
Measurements below are Windows x64 / Node 24.19.0 unless explicitly labeled otherwise.
Validated code/test/tooling commit: `cc36fac6c2f01ddc1ac139d35438fabb558b6d08`.
Hosted validation for the new gates is **PASS**, with inspected artifacts below.

## Reproduction

Pinned tools remain Prettier 3.9.10, ESLint 10.12.0, typescript-eslint 8.71.2,
TypeScript 6.0.3, Vitest/coverage-v8 5.0.5, Stryker core/runner 10.1.1,
eslint-config-prettier 10.1.8 and dependency-cruiser 18.7.0. No dependency added.

| Command                       | Evidence                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run check`               | Format, types, lint, warning ratchet, tooling tests, dependencies, build, ordinary tests |
| `npm run lint:report`         | `reports/lint.json`, including diagnostic complexity rules                               |
| `npm run lint:baseline`       | `reports/lint-warning-diff.json`; rejects errors and new warning fingerprints            |
| `npm run lint:baseline:prune` | Removes resolved debt only; cannot add fingerprints                                      |
| `npm run test:quality`        | Eight negative/positive tooling contracts, including missing-artifact subprocess         |
| `npm run test:coverage`       | V8 JSON/summary/HTML/LCOV and test JSON under `coverage/`                                |
| `npm run test:mutation`       | Config pilot JSON/HTML under `reports/mutation/`                                         |
| `npm run test:mutation:core`  | Core/middleware/events pilot under `reports/mutation-core/`                              |
| `npm run test:mutation:check` | Validates expected scopes, errors and assertion-only thresholds                          |
| `npm run report:dependencies` | `reports/dependencies.json`                                                              |
| `npm run test:wizard`         | Unit plus real terminal contracts                                                        |

## Reproduced before / after

| Measurement                                          |                             Starting commit |                                        Hardened local result |
| ---------------------------------------------------- | ------------------------------------------: | -----------------------------------------------------------: |
| Ordinary lint errors / warnings                      |                                     0 / 141 |                                                      0 / 118 |
| Analysis warnings (including metrics)                |                                         192 |                                                          172 |
| Complexity / depth / params / length review findings |                            11 / 19 / 3 / 18 |                                             13 / 19 / 3 / 19 |
| V8 lines                                             |                            73.57% (607/825) |                                             75.56% (631/835) |
| V8 branches                                          |                            65.70% (387/589) |                                             67.95% (403/593) |
| V8 statements / functions                            |                             73.87% / 82.40% |                                              75.81% / 88.09% |
| Config mutation                                      |          87 killed / 1 survived / 5 timeout |                                                    Unchanged |
| Import graph                                         | 25 modules / 44 dependencies; no violations | Same graph; additional established presentation restrictions |

Baseline ordinary tests: **134 passed / 30 existing platform or optional skips**;
coverage reproduced the same counts. Local runs overlapped and the baseline check
took 81 seconds; this is not a clean isolated speed comparison.
Final ordinary regression: **167 passed / 30 existing skips**, 37.36 seconds;
the gated coverage rerun passes with the same test counts.
Wizard: **14 unit tests and 13 real-terminal scenarios PASS**.

## Static analysis and warning policy

No-nested-ternary and require-await are now errors after narrowly scoped remediation.
Promise-returning wizard doubles still return promises; no observer, cleanup or native
process scheduling contract was changed. Unsafe shared test JSON now narrows real
values; a fixed fixture-path object replaces unchecked indexing. Ownership JSON is
validated from unknown by a local predicate. Historical incomplete manifests and extra
metadata remain accepted; parser diagnostics and formats are unchanged.

| Deferred category                                   |          Before |           After | Reason / follow-up                                                                              |
| --------------------------------------------------- | --------------: | --------------: | ----------------------------------------------------------------------------------------------- |
| Non-null assertions                                 |              44 |              37 | Remaining test runtime provisioning and state invariants need local characterization            |
| Unnecessary conditions                              |              13 |              11 | Typed guarantees differ from runtime external/platform state; do not mechanically delete guards |
| Unsafe test assignment / member / return / argument | 11 / 27 / 6 / 8 | 10 / 26 / 2 / 8 | Per-fixture JSON and npm module boundaries still need validation                                |
| Template / plus operands                            |           8 / 6 |           7 / 4 | Explicit numeric/string boundary handling remains                                               |
| Optional / nullish preferences                      |           1 / 4 |           1 / 4 | Empty environment values may intentionally behave differently from absent values                |
| Conversion / dynamic delete                         |           2 / 1 |           2 / 1 | Runtime TTY truthiness and Windows case-insensitive environment replacement preserved           |
| Confusing void / empty callbacks                    |           1 / 4 |           1 / 4 | Preserve wizard close return and intentional test no-ops; no broad exception                    |
| Nested ternary / async without await                |           3 / 2 |           0 / 0 | Errors now block recurrence                                                                     |

The ratchet uses ESLint's ordinary diagnostics, file-relative paths, rule/message IDs
and trimmed source context, with duplicate multiplicity. It ignores numeric line shifts.
It rejects a different warning even when another warning disappears. Resolved entries
must be pruned; CI never refreshes or expands the snapshot. Changes to the tracked
baseline require review. Identical diagnostic/context occurrences in the same file are
indistinguishable; moving that exact text is not a new fingerprint. This is a documented
limit, not a claim of semantic diff analysis. Formatting/context edits to legacy debt
can require a reviewed snapshot change; do not suppress findings to avoid review.

ESLint [bulk suppressions](https://eslint.org/docs/latest/use/suppressions) were rejected:
their per-file/rule counts permit replacement debt. The small comparator has direct
tests for replacements, duplicate findings, shifted lines and missing context. Diagnostics
remain visible; there are no eslint-disable blocks or production exclusions.

## Coverage and behavioral evidence

| Module / critical responsibility                    | Before line / branch | After line / branch | Remaining work                                                                                                      |
| --------------------------------------------------- | -------------------: | ------------------: | ------------------------------------------------------------------------------------------------------------------- |
| core: orchestration/failure precedence              |       87.50 / 70.00% |      95.31 / 83.33% | Defensive finalize-hook infrastructure failures and launch-stage failures                                           |
| process: resolution/settlement/cancellation         |       66.11 / 59.77% |      68.29 / 62.06% | Windows shim branches have separate real integration evidence; kill races use deterministic supplemental unit tests |
| lifecycle: planning/publication/recovery/inspection |       92.08 / 84.39% |      92.08 / 84.39% | Journal shape combinations, staging and cleanup failure precedence; retain real interruption tests                  |
| setup: ownership/rendering/removal                  |       90.51 / 89.28% |      90.75 / 89.77% | Rollback cleanup precedence, uncommon read/architecture failures                                                    |
| events: observation isolation                       |           93.33 / 0% |          100 / 100% | Correlated generic assertions remain an explicit adapter constraint                                                 |
| middleware: phases/env/cleanup                      |       97.61 / 91.66% |        100 / 95.83% | Unsupported runtime inputs and post-phase state characterization                                                    |
| config: validation/discovery                        |           100 / 100% |          100 / 100% | Existing equivalent mutant remains visible                                                                          |

Config, events and middleware enforce **95% lines / 90% branches**, the achieved
critical targets. Other files remain included with nonblocking targets; no difficult
production source is excluded. CLI/commands remain 0% in this collector despite real
black-box coverage. Demo is 71.42/50%; discovery 90.90/90.90%; wizard 70.83/72.54%.

Vitest 5.0.5's `coverage.autoAttachSubprocess` was executed against the full suite.
It writes NODE_V8_COVERAGE into worker environments, but isolated CLI fixture
environments intentionally omit it. CLI/commands stayed 0%, with the same overall
measurements as ordinary coverage. No environment-injection workaround was adopted;
keep real subprocess/terminal evidence separate. An initial direct-Node experiment
lacked npm_execpath and failed two npm fixture setups; rerunning through npm passed.
That setup failure is not evidence of an instrumentation-induced native defect.

Added behavioral guarantees include ordered primary/secondary failure identity,
exact-once finalization/cleanup and terminal event timing, disabled unknown middleware,
default registry, event payload correlation, late registration, reserved-name boundaries,
kill(false), escalation errors, and signal-visible-before-close. Shared JSON fixtures
reject malformed values. Thirteen manifest cases passed before changing parsing;
historical compatibility and additional metadata remain protected.

## Focused mutation evidence and gates

Local Windows x64; no mutator exclusions or ignored mutants. Config uses five tests;
Core/middleware/events use 28 focused tests with real Node execution where needed.

| Scope      | Total | Killed | Survived | No coverage | Timeout | Errors | Score / assertion-only |
| ---------- | ----: | -----: | -------: | ----------: | ------: | -----: | ---------------------: |
| config     |    93 |     87 |        1 |           0 |       5 |      0 |         98.92 / 93.55% |
| core       |   103 |     78 |       18 |           7 |       0 |      0 |         75.73 / 75.73% |
| middleware |    96 |     92 |        4 |           0 |       0 |      0 |         95.83 / 95.83% |
| events     |    15 |     15 |        0 |           0 |       0 |      0 |             100 / 100% |

Expanded initial pilot: **160 killed / 39 survived / 15 uncovered**, 52 seconds.
After survivor-driven assertions: **185 killed / 22 survived / 7 uncovered**, 56 seconds.
Config baseline rerun took 32 seconds. Timeouts are included in Stryker score but
excluded from assertion kills; conservative assertion score divides kills by all mutants.
Gates: config >=90% assertion kills, middleware >=85%, events >=95%. Core remains
measured debt; no target was lowered to label Core compliant. Runner errors, missing
scopes/reports, ignored mutants and compile/runtime error mutants fail the report gate.

Survivor review:

- Config's redundant prefix guard remains equivalent for valid TOML. Five loop/progress
  mutants time out and are not credited as behavioral assertions.
- Core survivors concentrate on platform selection/case-folded env deletion, launch-stage labels and terminal-event guard. Several are
  platform-equivalent, but native environment casing and diagnostics need stronger
  assertions. Seven uncovered mutants concern defensive finalize-hook infrastructure failures.
- Middleware survivors concern the runtime string-type guard (unsupported typed input),
  platform key identity, phase reset and hook removal. Phase reset/hook removal are
  genuine characterization gaps; not equivalent-mutant exclusions.
- Events have no survivors or uncovered mutants in the focused scope.

Ownership/recovery and Windows resolution mutation remain **NOT TESTED**. Their mixed
I/O responsibilities make a full reliable pilot expensive; existing real filesystem,
interruption and native subprocess tests remain mandatory. Do not redesign modules
just to improve mutation isolation. Stryker's local sandbox scans nested node_modules
and emits symlink warnings for .tools copies; workers still execute and reports are
validated. A sandbox worker-termination denial was resolved by an unsandboxed run.

## Dependencies, security and coupling

No cycles. Presentation-import prohibition now also covers process/setup/lifecycle/
discovery, extending an established boundary without claiming pure domain layering.
Core still composes config/demo/events/middleware/process; lifecycle couples setup and
process; wizard composes lifecycle/setup/discovery. Knip's prior evaluation found
runtime URL reads, native fixtures, npm bin links and dynamic registries: no automatic
deletions or new Knip gate are justified. All active B1 assets remain intact.

Audit remains **two moderate dev-only affected packages**: Stryker 10.1.1 ->
typed-rest-client 2.3.1 -> qs 6.15.1. Current upstream Stryker core/runner are still
10.1.1; core requires typed-rest-client ~2.3.0, which pins qs. Latest typed-rest-client
3.1.2 uses ^6.16.0; qs latest is 6.17.1. That major update is outside the supported
range. No forced override, disabled audit or unrelated upgrade was applied. Exposure
is developer/CI mutation tooling, not Arch production; keep report services local.
Current audit includes qs DoS advisories GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx,
GHSA-4mjr-xmp4-gh2g and GHSA-6pq8-jhm2-2vcw. Upstream remediation remains required.

## Complexity and next refactoring work

Production cyclomatic hotspots remain unchanged: commands 37, Core 23, lifecycle
inspection 26 / journal parser 20 / recovery validation 13 / application 14,
process resolution 16 / launch 15, setup 15 / uninstall 14, wizard 27.
Commands grows six nonblank lines for explicit presentation branches; no additional
production nesting/complexity trigger. Added metric findings are the mutation-report
validator (complexity 13, explicit fail-closed cases), explicit multi-format test-record
validation, and a test function length. These are visible tooling/test review debt.
Metrics are review triggers, not proof of human comprehensibility.

Next authorized-refactoring priorities:

1. Characterize Core standalone finalization, native spawn failures and environment
   casing; preserve error precedence and exactly-once cleanup before simplifying flow.
2. Ownership/journal validation, rollback and recovery cleanup failures; separate decisions
   and effects only under Structural Refactoring approval.
3. Windows npm resolution and process settlement/cancellation boundaries, retaining
   real console/TTY tests and project/native runtime independence.
4. CLI presentation and wizard control flow, preserving isolated environment evidence.
5. Event correlation and remaining test JSON/npm module boundaries; promote clean
   categories without casts, blanket exceptions or complexity-driven abstractions.

## CI evidence and cost

Required runtime aggregate name and workflow remain unchanged; branch protection
is not modified. Existing regression/wizard/portability matrices remain intact.
Quality CI adds the ratchet and focused mutation gates; summaries require actual
nonempty reports rather than treating step success as measurement success.
Mutation runs on relevant source/test/tooling PRs and weekly/manual invocations.

At the validated commit:

| Area       | Result and hosted duration                                          | Inspected evidence                                                                          |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Regression | PASS Ubuntu 55s / macOS 41s / Windows 103s                          | [Arch checks](https://github.com/Nickshajtan/hcc-harness/actions/runs/40954401675)          |
| Wizard     | PASS Ubuntu 26s / macOS 35s / Windows 52s                           | [Wizard checks](https://github.com/Nickshajtan/hcc-harness/actions/runs/40954401794)        |
| Runtime    | PASS Ubuntu 45s / macOS 50s / Windows 116s; required aggregate PASS | [Runtime portability](https://github.com/Nickshajtan/hcc-harness/actions/runs/40954401632)  |
| Quality    | PASS 87s total, including both mutation pilots                      | [Quality measurements](https://github.com/Nickshajtan/hcc-harness/actions/runs/40954401627) |

Downloaded JSON confirms 53 linted files / 0 errors / 172 analysis warnings
(118 legacy + 54 metrics); no new warning fingerprints. Ubuntu coverage:
**74.73% lines (624/835), 66.61% branches (395/593)**; 164 passed / 32 existing skips.
Ubuntu mutation: config 87 killed / 1 survived / 5 timeout; Core 78 killed / 6 survived /
19 uncovered; middleware 90 killed / 5 survived / 1 uncovered; events 15 killed / no gaps.
No compile/runtime errors or ignored mutants. All scopes pass their reviewed gates;
Core's score remains 75.73%, not compliance with its higher target. Platform-specific
mutant reachability differs; do not interchange survivor/uncovered counts with Windows.

The first hosted runtime run caught a decoder mistake: the new shared JSON validator
assumed the older native fixture format. B1 has full runtime and minimal PID/Node
console formats too. An initial correction covered the runtime format; Windows then
caught the minimal console format. All callers were inspected, and explicit typed
format selection now validates each contract without making required native fields
optional. Unit cases cover valid and malformed formats. Actual Windows console and
all shared runtime tests pass; no existing assertions, skips or timeouts were weakened.
These were test-infrastructure defects introduced during hardening, not production
runtime regressions or excuses to bypass mandatory CI.

The starting main's regression, wizard and runtime matrices were separately inspected
at `9c7ea4f`: [regression](https://github.com/Nickshajtan/hcc-harness/actions/runs/40935602961),
[wizard](https://github.com/Nickshajtan/hcc-harness/actions/runs/40935602837),
[runtime](https://github.com/Nickshajtan/hcc-harness/actions/runs/40935602680), all PASS.
Branch protection was inspected: strict mode and the existing required runtime
context remain unchanged. Full mutation, ownership/recovery mutation, Windows ARM64
and B2 production portability remain NOT TESTED in this milestone.
