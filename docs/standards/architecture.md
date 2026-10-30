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

| Pattern            | Justification                                                      |
| ------------------ | ------------------------------------------------------------------ |
| Strategy           | Genuinely different behavioral implementations behind one contract |
| Facade             | A stable, convenient subsystem boundary                            |
| State              | Meaningful state-dependent behavior and transitions                |
| Factory            | Nontrivial construction or dependency selection                    |
| Adapter            | External CLI, platform or tool integration                         |
| Observer/Event Bus | Existing execution event infrastructure                            |

A small conditional is preferable when variation is trivial. Do not introduce a
DI container, service locator, Command Bus, Repository pattern or elaborate
Abstract Factory without a demonstrated requirement and simpler alternative analysis.

## Cohesion and effects

**Testability by Design is a MUST.** Critical behavior must be testable without
unrelated application initialization or external dependencies. Use explicit
dependencies: constructor injection for cohesive stateful components, parameters
for simple functions, and narrow interfaces at meaningful boundaries. Control
clocks and randomness when they affect decisions. Prefer deterministic inputs and
observable results over hidden global/singleton state, import-time effects or
hardcoded external services. No dependency-injection container is required.
Real filesystem and subprocess contract tests remain mandatory; injection is not
an instruction to replace critical I/O evidence with mocks.

New subsystem boundaries MUST name their responsibility and contract. New
production code MUST make behavior understandable without AI reconstruction:
descriptive domain names, explicit side effects, readable control flow and cleanup,
guard clauses where useful, and explicit non-obvious invariants. Dense one-line
branches and deeply nested ternaries do not meet this standard. Existing debt is
recorded in the [measured baseline](quality-baseline.md), not silently grandfathered
into new code.

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

Critical error handling MUST make the primary failure, secondary failures, cleanup
order and recovery implications understandable. Do not silently swallow errors.
Observer-error isolation and intentionally nonfatal diagnostics are exceptions only
where their contracts explicitly require containment. Refactoring must preserve
existing failure precedence and cleanup behavior; readability is not authority to
change which error wins.

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

## Core execution boundaries

The public `core.ts` export facade preserves imports; `core/index.ts` owns
discovery/passthrough. The internal execution
session coordinates configured stages and owns per-run resources. Failure accumulation
is a separate ordered state object; environment composition is a deterministic function.
Keep process resolution/cancellation behind process.ts and hook dispatch/cleanup in the
existing pipeline. Do not bypass those contracts through session-specific alternatives.
See [the current responsibility map](../architecture.md#lifecycle-and-contracts).

The process facade forwards to focused environment, resolver, Windows shim, launch
and child-lifecycle modules. Mutable cancellation state belongs to one child;
resolution/adaptation remain functions. Process infrastructure MUST NOT import Core,
lifecycle or setup coordinators. Generic Core MUST NOT import Windows shim internals.
Do not replace direct-child settlement with process-tree management or runtime discovery.

## Lifecycle ownership boundaries

Keep recorded manifest parsing separate from route completeness, current-byte
verification and mutation authorization. Historical hashes remain authoritative;
renderer equality and runtime reachability are not ownership conditions.
`lifecycle/index.ts` coordinates public operations, while setup retains its
import-relative renderer. Low-level manifest/ownership/journal modules MUST NOT
import those coordinators; dependency-cruiser enforces this existing boundary.
Recovery validation is read-only. Recovery effects remain visible top-to-bottom
with their exact checkpoint and cleanup ordering. Do not replace this sequence
with generic transaction abstractions or hide deletion authority in an `isOwned()` boolean.

## Existing technical-debt baseline

See the [measured quality baseline](quality-baseline.md) for concrete responsibilities,
complexity, coverage gaps, mutation findings and refactoring priorities. Metrics
identify review work; they do not authorize a module split or change recovery,
runtime, ownership, middleware or event contracts.
