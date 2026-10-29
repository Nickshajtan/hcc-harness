# Arch engineering standards

**Human Comprehensibility First.** A human maintainer must be able to locate behavior,
understand execution flow and assess failure handling without asking an AI to
reconstruct the application. Correctness, passing tests and lint are necessary,
but do not establish maintainability on their own.

These standards govern new code and reviewed changes. They are not a claim that
existing code already conforms. This milestone changes policy only: no production
refactoring, dependencies, formatter configuration or new CI gates.

## Read by task

| Document | Read when |
| --- | --- |
| [Code style](code-style.md) | Writing or reviewing code, names, control flow or formatting |
| [Architecture](architecture.md) | Changing responsibilities, dependencies, state or public contracts; inspecting debt |
| [Testing](testing.md) | Planning validation, changing behavior or structurally refactoring |
| [Quality gates](quality-gates.md) | Selecting checks, proposing tooling or reporting enforcement |

Code changes normally require all four. Documentation-only work requires the
relevant policy and link/consistency checks; it does not require inventing tests.
The [current architecture](../architecture.md), [compatibility](../compatibility.md)
and [runtime portability design](../runtime-portability.md) describe actual contracts;
these standards describe how to maintain them. [Development instructions](../testing.md)
remain the source for commands, platform prerequisites and CI evidence.

## Policy levels and exceptions

- **MUST**: mandatory correctness, safety, compatibility or verified automation
  requirements. A proposed change to such a contract requires explicit scope and
  review; a local comment cannot authorize bypassing it.
- **SHOULD**: strong design preference. An exception needs a local explanation
  (comment for enduring code constraints, otherwise PR rationale) that names the
  constraint, alternative considered and validation. Keep exceptions narrow.
- **MAY**: optional technique selected for a demonstrated problem.

Detailed documents use these levels. Suggested targets and planned automation
are not current blocking thresholds. Existing deviations are a baseline, not
permission to spread the same problem. Keep unrelated cleanup out of feature PRs.
Reviewers assess readability directly; no metric proves human comprehension.

Agents MUST NOT bypass gates with broad eslint-disable directives, removed tests,
weakened assertions, difficult-file exclusions, artificial coverage inflation,
raised thresholds that conceal defects, or silent fallbacks replacing explicit
errors. Any legitimate exclusion needs specific, reviewable evidence and scope.

## Lightweight design review

For substantive changes, reviewers SHOULD ask:

1. Is the implementation understandable without AI assistance?
2. Are responsibilities clear and relevant behavior easy to locate?
3. Are abstractions justified by actual variation or state?
4. Is OOP versus functional composition appropriate?
5. Is platform-specific behavior isolated?
6. Are valid states and transitions explicit?
7. Are failures, error precedence and cleanup predictable?
8. Are public contracts preserved?
9. Do tests cover the relevant behavior and failure boundaries?

Answer in ordinary review comments; trivial changes need no separate report.
Explain consequential decisions that are not self-evident from the code.

## Adoption order

1. Measure formatting, lint, complexity, coverage and dependency baselines; review
   tool applicability and CI cost before adopting configuration.
2. Introduce agreed formatter and targeted static analysis in isolated changes,
   with explicit treatment of existing debt and fixture byte stability.
3. Add missing characterization/contract tests, then coverage reporting and a
   focused mutation pilot. Measure before making thresholds blocking.
4. Refactor one cohesive boundary at a time, preserving observable contracts;
   use evidence to decide dependency tooling and broader mutation gates.

Quality enforcement and structural refactoring are separate future tasks. This
standard does not authorize M2.2 B2 or extend Arch into provider/runtime management.
