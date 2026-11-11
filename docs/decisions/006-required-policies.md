# ADR-006: Trusted required policy applicability

## Status

Accepted H1-H5 implementation in PR #27; documentation recorded 2026-11-11.

## Context

An optional empty handler set allows valid requests. Provider request, execution and agent IDs are unauthenticated correlation and cannot decide whether enforcement is mandatory.

## Decision

Trusted adapter/configuration code supplies `requiredPolicies`. Required IDs must be configured, enabled, registered with matching module identity and contribute an applicable handler before evaluation begins. Never derive requirements from request identity fields.

## Consequences

Missing/disabled/unregistered IDs fail configuration before factories run. Missing applicable handlers fail at registration with code `configuration-error`. With no requirements, optional no-handler dispatch still allows. Requirements are request-local, not a dependency graph or inherited global policy tree.

## Considered alternatives

Inferring requirements from correlation identifiers would trust unverified input. Making every module mandatory would break optional/advisory composition. A dependency graph adds complexity beyond the current configured registry.

## Evidence and implementation references

[dispatchPolicy](../../src/policy.ts), [options and request contract](../../src/policy-contract.ts), [policy requirements](../provider-policy.md#engine-contract).

## Date and revision

The date above records consolidation or a reliably identified implementation revision,
not an invented historical approval meeting. See the linked original evidence.
