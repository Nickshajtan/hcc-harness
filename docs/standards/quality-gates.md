# Quality gates and adoption

A documented standard is not automatically enforced. See [policy levels](README.md)
and the [measured baseline](quality-baseline.md). Reading references is procedural;
no deterministic context-delivery guarantee or context injector is implemented.

## Current enforcement

| Control              | Command                                                                                                                                                                               | CI behavior                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Format               | `npm run format:check`                                                                                                                                                                | Blocking in existing Ubuntu/macOS/Windows checks                                                                              |
| Type safety          | `npm run typecheck`                                                                                                                                                                   | Blocking strict TypeScript, noUncheckedIndexedAccess, exactOptionalPropertyTypes                                              |
| Typed lint           | `npm run lint`, `npm run lint:baseline`                                                                                                                                               | Errors and new warning fingerprints block on all three platforms; legacy warnings remain visible                              |
| Dependencies         | `npm run check:dependencies`                                                                                                                                                          | Blocking no-cycles and presentation-boundary rules                                                                            |
| Build and regression | `npm run build`, unit/integration/acceptance/experiment scripts                                                                                                                       | Existing three-platform jobs retained                                                                                         |
| Wizard               | `npm run test:wizard`                                                                                                                                                                 | Existing path-filtered/manual three-platform workflow retained                                                                |
| Runtime portability  | Existing shared subprocess and Windows console/TTY suites                                                                                                                             | Required aggregate remains exactly `M2.2 runtime portability required`                                                        |
| Coverage             | `npm run test:coverage`                                                                                                                                                               | Core/config/events/middleware, lifecycle/process and measured CLI/Wizard scopes >=95% lines / >=90% branches; others measured |
| Mutation pilots      | `npm run test:mutation`, `npm run test:mutation:core`, `npm run test:mutation:lifecycle`, `npm run test:mutation:process`, `npm run test:mutation:cli`, `npm run test:mutation:check` | Relevant PRs/weekly/manual; per-file assertion-only gates below                                                               |
| Debt report          | `npm run lint:report`, `npm run report:dependencies`                                                                                                                                  | JSON artifacts in quality measurement job                                                                                     |

`npm run check` combines format, typecheck, lint, warning regression protection,
quality-tooling tests, dependency rules, build and the
ordinary suite. Run wizard and relevant runtime suites additionally. Existing main
branch protection is unchanged; formatting/lint failures fail CI, but this milestone
does not claim a new separately required branch-protection context. Preserve the
existing runtime aggregate's name, platform coverage, failure semantics and protection.

## Static analysis configuration

`eslint.config.mjs` uses typescript-eslint strictTypeChecked and
stylisticTypeChecked with project service for production/tests/TS configuration.
Maintained JS/MJS/CJS scripts and configuration use non-type-aware recommended
rules. All B1 MJS files are included. The only code exclusion is the frozen M1
renderer; the CommonJS native fixture narrowly permits no-require-imports because
require() is its intended runtime contract. C/C++, shell and PowerShell remain
outside ESLint; embedded workflow JavaScript is reviewed through workflow tests.

Blocking rules include no-floating-promises, no-misused-promises, no-unsafe-call,
production unsafe assignment/member/argument/return checks, no-explicit-any,
consistent-type-imports, no-unnecessary-type-assertion in production,
switch-exhaustiveness-check, strict equality, curly braces and Yoda equality.
The supported rule spelling for unsafe calls is `@typescript-eslint/no-unsafe-call`.
Type-only import annotations remain allowed for vi.importActual module shapes.
`eslint-config-prettier` disables conflicting layout rules; semantic curly/Yoda rules
are deliberately applied afterwards. Prettier is the sole layout authority.

The configuration names specific legacy rules at warning severity with rationale.
Remaining warnings are **reviewed debt, not compliance**: guarded teardown after
failed beforeAll and intentional empty-string environment fallbacks. Non-null
assertions and unsafe assignment/member/argument/return/type-assertion checks now
block tests as well as production after boundary validation and prerequisite
checks removed the findings. Dynamic deletion and test empty functions also block.
They remain reported and reviewable, not hidden by eslint-disable blocks.

Before promoting one of these rules, characterize the affected behavior, remediate
one cohesive category, rerun contracts, then change severity. New code MUST follow
the readability/safety standards even where automation still warns. No-nested-ternary
and require-await now block. A small source-context fingerprint ratchet rejects new
ordinary warnings and requires pruning resolved debt. The measured baseline explains
its limits: identical contexts remain indistinguishable. Snapshot additions need review
and MUST NOT conceal new debt. Do not create a generic lint framework.
Prefer-optional-chain, no-confusing-void-expression, no-unnecessary-type-conversion
and restrict-template-expressions now block globally; test plus operands also block.
No-unnecessary-condition blocks production; no-non-null-assertion
blocks all maintained typed code. Remaining test condition findings
stay visible in the ratchet. This does not claim that every type assertion is safe.
Strict-boolean-expressions remains unadopted pending review of intentional length,
optional-state and environment truthiness conventions; existing constant/unnecessary
condition diagnostics are not evidence of complete misleading-boolean detection.

## Complexity and dependencies

`eslint.analysis.config.mjs` reports complexity >12, depth >3, parameters >4 and
function length >60 nonblank/noncomment lines. These are design review triggers,
not proof of a defect or universal size limits. Module size and import graphs are
recorded in the baseline. No function extraction or parameter bundling to game metrics.

Dependency-cruiser enforces only demonstrated invariants with a small config.
Future pure-domain/provider boundaries require mapping actual responsibilities
before adding rules. Knip was evaluated but is not installed or enforced; URL
reads, npm bin links, vendor executables, native fixtures, dynamic registries and
CI-only scripts require reference checks. No automatic dead-code deletion.

## Measurement adoption and cost

Coverage includes all executable production files. Numeric targets in
[testing](testing.md) remain nonblocking outside the achieved Core/execution/config/events/middleware
and measured lifecycle/process scopes; uncovered branches
must be explained rather than excluded. Mutation remains a focused pilot, not a
repository-wide PR suite. Relevant-change selection avoids duplicating its cost on unrelated PRs.
Process mutation covers all five implementation modules, using deterministic child
events, explicit platform-policy tests, real filesystem fixtures and supplemental
fault injection. Real Windows npm, console, terminal and runtime contracts remain
separate required regression/portability evidence. No production branch is excluded.
The Windows process pilot took 257 seconds under concurrent load; the initial
pilot took 380 seconds. See the baseline for final hosted cost. These are observations,
not isolated performance benchmarks. Keep focused mutation in the existing measurement
job, not every platform regression job; its existing 15-minute budget is unchanged.
Timeouts do not count toward assertion-only thresholds. Missing/erroneous reports fail;
Each Core responsibility file retains its 85% assertion-only gate. The lifecycle
pilot gates only the four complete measured decision modules, not effect coordinators.
Process gates require environment/shim/child lifecycle 90% and resolver/launch 85%
assertion kills, adopted after executed measurements. Missing files, empty reports,
errors, exclusions and timeout-only evidence fail. Full-repository scheduled/release
mutation remains a proposal.

Each gate expansion MUST state expected defect detection, measured minutes,
platforms, maintenance cost and adoption/rollback path. Preserve regression suites;
no assertion failures converted into warnings, no silent mandatory-platform skips.

## CLI and Wizard adoption

The CLI/Wizard pilot (`npm run test:mutation:cli`) covers complete parsing, dispatch,
status presentation, CLI signal/exit mapping, input decisions and workflow modules.
Reviewed assertion-only gates are 85% per file, with 90% for input decisions.
Readline and static installation messages remain covered by real terminal and
regression tests, outside this focused mutation scope. No mutation range is excluded.
Observed pilot times are 114–279 seconds on Windows depending on concurrent load;
hosted cost is recorded in the PR.
The existing quality job runs it for relevant changes; its 15-minute budget is
unchanged. No pilot is duplicated across platform matrices.

All six CLI/Wizard decision/workflow modules and Wizard presentation enforce
95% line / 90% branch coverage after measurement. Thin executable and readline V8
gaps remain reported; subprocess/PTY contracts are retained. Existing scoped gates
and required runtime aggregate are unchanged. The [determinism standard](determinism.md)
is a review requirement, not proof of deterministic OS scheduling or incident resolution.

## Installation and effect adoption

Installation rendering/setup and lifecycle planning/publication/recovery/removal
now enforce the measured 95% line / 90% branch scopes. These gates complement
real subprocess and fault-injection contracts; they do not prove filesystem stability.
The separate effect mutation job runs for relevant installation/lifecycle PRs and
scheduled/manual quality runs. It preserves the established job's 15-minute budget;
its own 25-minute budget follows the initial 16m45s Windows observation. The
complete five-module pilot enforces 85% assertion-only kills per module after
Windows and hosted POSIX measurements, with zero timeout credit. Negative tooling
tests reject survivor-only and timeout-only reports for every effect file. `node scripts/report-effects-mutation.mjs` rejects missing scopes, errors,
ignored mutants and missing reports, and marks unmet targets explicitly. Existing
five blocking pilots and all thresholds remain unchanged.
Mutation validators also require the reported original source to match the current
file (allowing checkout line endings). An older passing score cannot validate edited
code. Coverage summaries require every maintained production TS file, and test
totals must match the actual assertion records; totals alone cannot hide omissions.

## Completion evidence

`npm run check:reliability` rejects missing, malformed, truncated, duplicate or
failing first-attempt uninstall evidence. Four profiles must contain all 96
operations and completed teardown. CI also requires the integration JSON report
and passing npm help, raw executable lifetime and platform-applicable sharing
contracts. A reused workspace's stale PASS is replaced by FAIL when validation
fails; report-write failures fail the process. This is evidence validation, not
causal incident resolution.

Regression summaries likewise require complete unit, integration and acceptance
JSON reports. A successful command with a missing/incomplete report fails the job.
Dependency evidence requires an explicit zero-error summary; module names alone
cannot certify a clean graph. Negative tooling tests exercise these failure paths.

The dedicated Windows reliability job runs relevant PRs and scheduled/manual
checks in an isolated ten-minute job budget. It uses the same tests as regression,
without mutation load or retry-until-green behavior. Existing required check names
and branch protection remain unchanged. Raw executable faults remain failures,
even when a separate unsandboxed comparison passes.

Report PASS / FAIL / NOT TESTED, exact commands, counts/skips, inspected CI links,
contract compatibility, remaining warnings and measurement limitations. A green
local run does not establish three-platform success. Explain non-obvious decisions,
review the diff and byte-sensitive assets, and disclose deviations. Branch
protection changes need explicit authorization; this milestone does not alter them.
