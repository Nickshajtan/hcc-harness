# Development agent instructions

**Human Comprehensibility First.** Passing tests and lint are necessary, but code
must also be understandable and maintainable by human engineers without AI assistance.

Before implementing or modifying code:

1. Read [the standards entrypoint](docs/standards/README.md), then its applicable
   detailed documents. Reading this router alone is insufficient.
2. Inspect affected module boundaries, callers, public contracts and platform behavior.
3. Identify applicable quality, ownership, recovery and compatibility requirements.
4. Choose the simplest maintainable design and define a test strategy before editing.
   Read [determinism and failure transparency](docs/standards/determinism.md) for
   critical state, concurrency, diagnostics and incident investigations.
   Testability by Design, readable new production code, explicit subsystem contracts
   and understandable critical failure semantics are MUSTs; see architecture standards.

Before completing a task:

1. Run applicable checks from [quality gates](docs/standards/quality-gates.md).
2. Verify public contract compatibility and review the diff for unnecessary complexity.
3. Identify standards deviations and explain non-obvious architectural decisions.
4. Report checks actually executed as PASS / FAIL / NOT TESTED, including skips and
   limitations. Do not claim uninspected CI results or document-reading guarantees.

MUST, SHOULD, MAY and exception handling are defined in the standards entrypoint.
Do not bypass gates by suppressing diagnostics, weakening tests or hiding source.
M2.2 B1 is verified feasibility; B2 production integration requires separate approval.
Preserve current runtime, ownership and process contracts unless a task explicitly
authorizes changing them. See the [active portability design](docs/runtime-portability.md).
