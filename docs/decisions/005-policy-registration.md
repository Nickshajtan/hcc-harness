# ADR-005: Synchronous policy registration

## Status

Accepted H1-H5 implementation in PR #27; documentation recorded 2026-11-11.

## Context

Per-request handler lists must be complete before required-handler checks and evaluation. Awaiting arbitrary returned thenables permits registration to suspend or escape its admission window.

## Decision

`registerPolicy()` must synchronously return `undefined`. Async evaluation belongs inside registered handlers. Close each module registration window immediately after return or throw. Reject all other returns; observe genuine rejected Promises without inspecting arbitrary thenables.

## Consequences

Required applicability is determined before handlers start. Partially registered cleanup still runs after registration failure. Existing process `register()` semantics are preserved; the stricter policy rule is not a newly imposed process deadline contract.

## Considered alternatives

Awaited async registration could simplify loading state but blurs registration/evaluation and permits unbounded admission. Lazy async state belongs in a handler with cooperative cancellation.

## Evidence and implementation references

[Engine registration](../../src/policy.ts), [typed API](../../src/policy-contract.ts), [H1-H5 evidence](../validation/provider-policy-v1.md).

## Date and revision

The date above records consolidation or a reliably identified implementation revision,
not an invented historical approval meeting. See the linked original evidence.
