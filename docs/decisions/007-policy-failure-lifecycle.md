# ADR-007: Fail-closed cooperative policy lifecycle

## Status

Accepted H1-H5 implementation in PR #27 (`3f6aa20`); documentation recorded 2026-11-11.

## Context

Handlers may deny, throw, return invalid decisions, time out or ignore cancellation. Cleanup can fail or overrun. Results must preserve prior denials and primary/secondary failure evidence deterministically.

## Decision

Run handlers sequentially in registration order. Any failure yields `policy-error`; otherwise any denial wins over allow. Share one monotonic policy deadline and one absolute cleanup grace end. Abort cooperatively; reverse cleanup checks admission before each callback and reports skipped callbacks explicitly.

## Consequences

Default policy budget is 5000 ms plus 100 ms grace. A timeout cannot be erased by a late allow. Frozen results retain causes locally; adapters sanitize them. Timers do not preempt CPU-bound JavaScript or force resource release. Transport uses a separate reserved budget and can fail even after a decision.

## Considered alternatives

A fresh timeout per callback loses a bounded total wait. Unlimited cleanup can hang refusal; silently dropping cleanup hides failure. Worker/process isolation could forcibly bound execution but is not implemented and would introduce new resource and API contracts.

## Evidence and implementation references

[Deadline](../../src/policy-deadline.ts), [engine](../../src/policy.ts), [transport](../../src/mock-transport.ts), [policy lifecycle](../provider-policy.md#policy-failure-lifecycle), [validation](../validation/provider-policy-v1.md).

## Date and revision

The date above records consolidation or a reliably identified implementation revision,
not an invented historical approval meeting. See the linked original evidence.
