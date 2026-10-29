# Quality gates and adoption

A documented standard is not automatically enforced. See [policy levels](README.md)
and the [measured baseline](quality-baseline.md). Reading references is procedural;
no deterministic context-delivery guarantee or context injector is implemented.

## Current enforcement

| Control              | Command                                                                                                                 | CI behavior                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Format               | `npm run format:check`                                                                                                  | Blocking in existing Ubuntu/macOS/Windows checks                                                                                |
| Type safety          | `npm run typecheck`                                                                                                     | Blocking strict TypeScript, noUncheckedIndexedAccess, exactOptionalPropertyTypes                                                |
| Typed lint           | `npm run lint`, `npm run lint:baseline`                                                                                 | Errors and new warning fingerprints block on all three platforms; legacy warnings remain visible                                |
| Dependencies         | `npm run check:dependencies`                                                                                            | Blocking no-cycles and presentation-boundary rules                                                                              |
| Build and regression | `npm run build`, unit/integration/acceptance/experiment scripts                                                         | Existing three-platform jobs retained                                                                                           |
| Wizard               | `npm run test:wizard`                                                                                                   | Existing path-filtered/manual three-platform workflow retained                                                                  |
| Runtime portability  | Existing shared subprocess and Windows console/TTY suites                                                               | Required aggregate remains exactly `M2.2 runtime portability required`                                                          |
| Coverage             | `npm run test:coverage`                                                                                                 | Core/config/events/middleware plus manifest/ownership/journal/recovery-validation >=95% lines / >=90% branches; others measured |
| Mutation pilots      | `npm run test:mutation`, `npm run test:mutation:core`, `npm run test:mutation:lifecycle`, `npm run test:mutation:check` | Relevant PRs/weekly/manual; existing assertion-only gates plus manifest/journal 85%, ownership/recovery validation 90%          |
| Debt report          | `npm run lint:report`, `npm run report:dependencies`                                                                    | JSON artifacts in quality measurement job                                                                                       |

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
These warnings are **deferred debt, not compliance**: no-non-null-assertion,
no-unnecessary-condition, prefer-optional-chain, prefer-nullish-coalescing,
no-dynamic-delete, restrict-template-expressions, no-confusing-void-expression,
no-unnecessary-type-conversion; tests additionally retain
unsafe boundary/assertion/plus-operand and empty-function warnings.
They remain reported and reviewable, not hidden by eslint-disable blocks.

Before promoting one of these rules, characterize the affected behavior, remediate
one cohesive category, rerun contracts, then change severity. New code MUST follow
the readability/safety standards even where automation still warns. No-nested-ternary
and require-await now block. A small source-context fingerprint ratchet rejects new
ordinary warnings and requires pruning resolved debt. The measured baseline explains
its limits: identical contexts remain indistinguishable. Snapshot additions need review
and MUST NOT conceal new debt. Do not create a generic lint framework.
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
scopes; uncovered branches
must be explained rather than excluded. Mutation remains a focused pilot, not a
repository-wide PR suite. Relevant-change selection avoids duplicating its cost on unrelated PRs.
The latest measured config, execution and lifecycle pilots took 37, 64 and 115 seconds locally,
with other checks running; these are not isolated performance benchmarks.
Timeouts do not count toward assertion-only thresholds. Missing/erroneous reports fail;
Each Core responsibility file retains its 85% assertion-only gate. The lifecycle
pilot gates only the four complete measured decision modules, not effect coordinators. Full-repository scheduled/release
mutation remains a proposal.

Each gate expansion MUST state expected defect detection, measured minutes,
platforms, maintenance cost and adoption/rollback path. Preserve regression suites;
no assertion failures converted into warnings, no silent mandatory-platform skips.

## Completion evidence

Report PASS / FAIL / NOT TESTED, exact commands, counts/skips, inspected CI links,
contract compatibility, remaining warnings and measurement limitations. A green
local run does not establish three-platform success. Explain non-obvious decisions,
review the diff and byte-sensitive assets, and disclose deviations. Branch
protection changes need explicit authorization; this milestone does not alter them.
