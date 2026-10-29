# Architecture and maintainability

Read [policy levels](README.md) and the [current architecture](../architecture.md).
These are intended boundaries, not a mandate for a new directory hierarchy.

## Composition, objects and patterns

Arch SHOULD prefer pragmatic OOP when it improves encapsulation, state management,
explicit contracts, testability, behavioral variation or human understanding.
Existing per-execution `EventBus` and pipeline state are useful examples. Functions
and composition SHOULD serve stateless transformations, utilities, pure decisions
and simple orchestration. Do not create a class around one static function.
Prefer composition over inheritance; avoid speculative inheritance hierarchies.

Patterns MAY solve demonstrated problems:

| Pattern | Justification |
| --- | --- |
| Strategy | Genuinely different behavioral implementations behind one contract |
| Facade | A stable, convenient subsystem boundary |
| State | Meaningful state-dependent behavior and transitions |
| Factory | Nontrivial construction or dependency selection |
| Adapter | External CLI, platform or tool integration |
| Observer/Event Bus | Existing execution event infrastructure |

A small conditional is preferable when variation is trivial. Do not introduce a
DI container, service locator, Command Bus, Repository pattern or elaborate
Abstract Factory without a demonstrated requirement and simpler alternative analysis.

## Cohesion and effects

Each module SHOULD have one identifiable conceptual responsibility, so a maintainer
can locate relevant behavior without reconstructing the application. Prefer small
cohesive modules over files mixing unrelated work. One function does not require
one file; file size alone does not prove a design defect. A split must improve
cohesion without excessive indirection or circular dependencies.

Separate decisions from effects where practical: route-set decisions from file
publication, ownership validation from deletion, runtime policy from process
creation, transition validation from journal persistence. Pure functions SHOULD
handle deterministic domain decisions; classes/adapters MAY encapsulate stateful
infrastructure. Existing `planRoutes` still performs filesystem inspection; it is
not a pure function merely because it is called a plan. Do not impose artificial
layers or a complete hexagonal architecture.

## Dependency direction

Domain decisions SHOULD depend on domain types and explicit inputs, not CLI output,
process globals or concrete filesystem access. Application orchestration composes
decisions and infrastructure through narrow contracts where useful. Platform and
filesystem implementations supply effects; CLI presentation calls application
operations and translates results into messages/status. Generic Core MUST NOT gain
provider-specific or platform policy simply to make an adapter convenient.

Provider-specific adapters, if separately authorized in the future, depend on shared
contracts; domain/Core must not import them. This standard does not authorize
provider work. Avoid cycles and presentation imports from domain/infrastructure.
Current files mix some roles: these directions are future review rules, not claims
that the current import graph implements a strict layered architecture.

Before machine enforcement, map actual imports and label conceptual responsibilities.
Candidate rules: no cycles, no CLI imports into domain helpers, no Node filesystem
or process imports into designated pure modules, no provider imports into Core.
Use a reviewed allowlist for necessary composition edges; do not move every file
into a new tree merely to make a dependency checker pass.

## State and protected behavior

Stateful systems SHOULD expose valid states and transitions through discriminated
unions, state objects, transition tables or State pattern where helpful. Do not add
a state-machine framework without evidence of reduced complexity.

Changes MUST preserve journal ordering, exclusive publication, hash validation,
collision behavior, cleanup ordering, failure precedence and repeated-operation
idempotency unless explicitly authorized as contract changes. Refactoring MUST
preserve execute(), middleware, events, CLI/exit codes, status JSON, manifests and
native arguments/env/cwd/stdio/signals. Tests must establish relevant boundaries
before structural change; a source split alone does not prove equivalence.

M2.2 B1 remains verified feasibility; B2 is planned, separately gated. Preserve
Arch/project/native runtime independence, explicit ARCH_NODE policy, native PATH
selection, authoritative legacy ownership hashes, modified-file protection and
explicit rebind preserving edited middleware. See [active design](../runtime-portability.md)
for the source of these requirements; no automatic discovery, downloads or migrations.

## Existing technical-debt baseline

Inspected at main `0d229c1b5434b91acbd14b19145d62d03a154162`. These are candidate
modernization boundaries, not instructions to split every large file or proven bugs.

| Area | Observed concern | Candidate improvement and contract risk |
| --- | --- | --- |
| `src/lifecycle.ts` | Manifest/journal parsing, file staging/publication, route planning, recovery, mutation wrappers and status inspection coexist; `applyJournal` encodes ordered checkpoints | Separate validated journal/plan decisions, ownership inspection and effectful reconciliation only where boundaries clarify flow; retain checkpoint order, no-clobber and recovery acceptance |
| `src/setup.ts` | Manifest validation, command validation, platform launcher rendering, initialization rollback, uninstall and symlink safety share a module; `checkFiles` uses a recovery boolean | Consider renderer and ownership-validation boundaries plus named recovery policy; preserve frozen M1 bytes/hashes, missing-file rules, uninstall journal and edited config |
| `src/process.ts` | PATH filtering/resolution, Windows npm target/shebang/adjacent Node policy and child cancellation/settlement share one path | Consider pure resolution decisions and narrow Windows adapter; preserve native Node independence, direct-child semantics, idempotent settlement and timers |
| `src/commands.ts` | Parsing, validation, command dispatch, status formatting and terminal lifecycle use dense branch chains | Consider parsed request types and focused handlers/presentation; preserve prompt-free uninstall, confirmation-based deinit, errors and deterministic wizard equivalents |
| `src/core.ts` | Nested try/finally accumulates errors, tracks failure stage, runs finalization/disposal and publishes terminal events; default registry imports demo | Clarify phase/result/error decisions and explicit registry composition without changing first-error cause, finalization order, passthrough or observer isolation |
| `src/events.ts` | Payload/type correlation crosses generic assertions (`as ArchEvent<T>`, `as never`); observer/report errors are intentionally contained | Consider a tighter typed envelope/adapter boundary; characterize correlation and awaited observer-error isolation before changing assertions |
| Lint/tooling | Recommended, non-type-aware typescript-eslint; lint command includes src/tests and only `scripts/check-wizard.mjs`; CJS fixture excluded; other B1 scripts and C/PowerShell/shell assets lack equivalent lint coverage | Inventory executable languages and provenance before extending checks; strict TS already enabled; formatting, coverage/mutation and dependency baselines absent |
| Documentation/assets | `docs/testing.md` mixes ordinary instructions with B1 reproduction/evidence; B1 tests/scripts remain milestone-organized | Reassess navigation and naming after B2; preserve active prototypes, fixtures, evidence and workflow paths today |

Dense one-line branches, right-hand literal comparisons and several positional
parameters also differ from the new style. There is no measured complexity,
coverage or mutation score yet; do not invent numeric debt or classify every
assertion as unsafe without examining its invariant.
