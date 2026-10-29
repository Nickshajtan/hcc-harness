# Testing standard

Use [policy levels](README.md) and [existing execution instructions](../testing.md).
Define a test strategy before implementation: affected contracts, failure cases,
appropriate layers and platforms, fixtures and required evidence.

## Layers

| Layer | Responsibilities |
| --- | --- |
| Unit | Domain validation, routing plans, state transitions, runtime policies, error precedence and middleware lifecycle |
| Functional/integration | Real filesystems and subprocesses; args/env/cwd/stdio; signals/cancellation; routing/recovery; cross-platform behavior |
| Contract | Public execute(), middleware API, event schemas/semantics, CLI commands/exit codes, status JSON, manifest compatibility, ownership/recovery guarantees |
| Property-based | Selective generated route names, state invariants, idempotency, manifest inputs, paths and recovery combinations |
| Mutation | Critical domain decisions, lifecycle/recovery, ownership, cancellation/errors, runtime resolution and middleware semantics |

Contract is a purpose, not necessarily a new directory: existing unit/integration/
acceptance suites already test contracts. Do not reorganize tests cosmetically.
Use property-based tests when input combinations expose meaningful gaps; preserve
reproducible seeds and minimized counterexamples. Do not introduce a generator
library merely to replace a few readable examples.

## Behavioral protection

Critical state transitions, important crash boundaries and recovery paths MUST
have explicit behavioral coverage. Before structural refactoring, add missing
characterization tests that capture existing intended behavior. Assert externally
observable state, results and errors rather than private helper call order, except
where ordering itself is a recovery contract.

Preserve real subprocess interruption tests and ownership fixtures. Mocked errors
are useful supplements, not proof of actual filesystem, console or process behavior.
Tests MUST isolate temporary directories, runtime copies, prefixes and environment;
do not mutate global Node installations or shell profiles. Maintain M1/M2/M2.1
fixtures and Windows exe/shim coverage. Distinguish real version-manager switching
from PATH simulation and B1 prototypes from production portability.

Signals need platform-specific assertions for supported behavior; an unsupported
case is NOT TESTED with a reason, never a silent pass. Mandatory runtime matrix
contracts permit no platform skips. Native execution tests SHOULD cover args,
environment isolation, cwd, inherited streams/TTY, exit status and cancellation.

## Initial targets, not enforced thresholds

No coverage or mutation baseline has been measured. These are adoption targets:

| Metric | Critical modules | Other production |
| --- | ---: | ---: |
| Line coverage | >=95% | >=85% |
| Branch coverage | >=90% | >=80% |
| Mutation score | >=85% | >=70% |

Critical areas are ownership, recovery/publication, cancellation, runtime resolution,
Core error precedence and middleware lifecycle. Map these responsibilities to files
before calculating category results; mixed modules must not hide critical branches
in an easier average. Evaluate >=90% mutation for ownership, recovery and
cancellation only after measuring the baseline and meaningful mutant population.

Coverage does not replace behavior tests. Do not weaken assertions, exclude hard
source or write implementation-mirroring tests just to improve a score. Explain
uncovered branches, equivalent mutants and platform gaps separately.

## Mutation adoption

StrykerJS is the preferred candidate, not installed or enabled. First pilot a small
critical domain boundary, checking TypeScript/Vitest compatibility, test selection,
determinism, runtime and meaningful surviving mutants. Record tool/version,
source scope, platform, duration, killed/survived/no-coverage/timeouts and exclusions.
Do not count a timeout as evidence of the intended behavioral assertion.

Review every relevant surviving mutant: add a behavioral test for a real gap,
fix the defect if one is revealed, or document why the mutant is equivalent or
outside the contract. Exclusions MUST be narrow, justified and reviewed; generated
or vendored bytes can justify exclusion, difficult recovery code cannot.

After a measured pilot, relevant critical PRs SHOULD run focused mutation tests;
full mutation belongs on scheduled runs or release gates if cost is acceptable.
Measure execution minutes and flakiness before choosing frequency, caching or
concurrency. Do not activate repository-wide mutation on every PR without evidence.
Report only executed results and keep ordinary regression checks independent.
