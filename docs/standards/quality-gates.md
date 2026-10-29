# Quality gates and adoption

See [policy and exceptions](README.md). A documented standard is not automatically
enforced. Reading referenced documents is a procedural requirement, not a
deterministic context-delivery guarantee. Context injection is outside this milestone.

## Current enforcement versus proposals

| Control                | Available automation today                                                        | Current CI enforcement                                     | Future proposal                                      |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Type safety            | `npm run typecheck`; strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes | Existing three-platform checks                             | Preserve; assess typed lint separately               |
| Lint                   | `npm run lint`; recommended typescript-eslint and unused-variable rule            | Existing three-platform checks                             | Expand measured scope and typed analysis             |
| Build/regression       | build, experiment, unit, integration, acceptance scripts                          | Existing Ubuntu/macOS/Windows matrix                       | Preserve contracts and platform evidence             |
| Wizard                 | `npm run test:wizard` and terminal script                                         | Path-filtered three-platform workflow or explicit dispatch | Preserve coverage and accurate trigger claims        |
| Runtime portability    | Shared real subprocess contract, Windows executable/console tests, real TTY       | Three-platform matrix plus required aggregate              | Preserve exactly `M2.2 runtime portability required` |
| Formatting             | No designated formatter installed/configured                                      | None                                                       | Prettier configuration and check                     |
| Coverage/mutation      | No configured baseline/reporting                                                  | None                                                       | Coverage measurement, focused StrykerJS pilot        |
| Dependencies/dead code | Manual import/reference inspection                                                | None                                                       | Evaluate dependency-cruiser / Knip                   |

The runtime aggregate is the recorded required main status check, with strict
up-to-date checks and admin enforcement. Other existing jobs run in workflows;
do not describe each as branch-protection-required without inspecting settings.
This milestone MUST leave workflows, dependencies and branch protection unchanged.
Use [development instructions](../testing.md) for actual workflow paths and evidence.

## Static analysis proposal

Prefer upstream typescript-eslint `strictTypeChecked` and `stylisticTypeChecked`
presets over a large bespoke rule collection, after measuring compatibility and
type-aware lint cost. Evaluate consistent type imports, no-floating-promises,
no-misused-promises, unsafe-value handling, no-unnecessary-type-assertion,
no unexplained any and exhaustive discriminated-union handling. Narrow unknown
values at I/O boundaries; do not silence errors with casts.

Evaluate Yoda equality ([convention and exceptions](code-style.md)), curly braces,
strict equality, no nested ternaries and complexity/depth/parameter rules. Existing
recommended lint is not evidence that these policies are all checked today.

| Review trigger        | Initial suggested target                               |
| --------------------- | ------------------------------------------------------ |
| Cyclomatic complexity | <=10–12; select an exact tool threshold after baseline |
| Nesting depth         | <=3                                                    |
| Parameters            | <=4                                                    |
| Function length       | Review around 40–60 lines, not a universal hard limit  |

These trigger design review, not automatic proof of a defect. A cohesive ordered
recovery operation may justify an exception; explain its invariants and tests.
Do not split it into opaque helpers or bundle unrelated parameters to game a metric.
Do not enable incompatible blocking thresholds before measuring existing code.

## Dependency and dead-code analysis

Evaluate dependency-cruiser only if it can express the actual
[conceptual boundaries](architecture.md) with a small understandable rule set.
First inspect cycles and forbidden edges in report mode. Evaluate Knip only if
entrypoint-aware analysis helps find real unused exports/files/dependencies.
Account for npm bin, runtime URL reads, vendor binaries, fixtures, dynamic registry
construction and CI-only scripts before deleting anything it flags.
Neither tool is installed or approved for automatic deletion. Record actionable
findings, false positives, maintenance and runtime cost before adding either.

## Proposed CI policy, not activated

Future PR required gates SHOULD cover formatting, typecheck, lint, unit tests,
integration/contract tests, coverage and existing cross-platform suites. Adopt
reporting before blocking new numeric thresholds. Avoid duplicate jobs when existing
ones already supply equivalent evidence. Selected critical changes SHOULD add
relevant mutation tests after the pilot; scheduled/release checks MAY run the full
mutation suite and extended portability/integration tests.

Each tooling/gate proposal MUST state the gap, expected defect-detection value,
measured CI minutes, platform coverage, maintenance cost and rollout/rollback plan.
Preserve the mandatory portability check name and protection; cost control cannot
silently remove a platform or turn assertions into warnings. New tools and gates
require a separate change, not activation through this documentation.

## Completion evidence

Run applicable existing checks; code changes normally need `npm run check` plus
focused tests and affected platform workflows. Lifecycle/CLI changes need relevant
recovery/wizard coverage; runtime/process changes need mandatory portability evidence.
Docs-only changes need link/consistency review; run baseline checks when the task
requires them, as this standards milestone does.

Report PASS / FAIL / NOT TESTED, exact commands, meaningful counts/skips and CI
links whose results were inspected. Verify contract compatibility and review the
diff for unrelated behavior, dependency or formatting changes. Disclose deviations
and unresolved risks. A green local run does not establish three-platform success.
