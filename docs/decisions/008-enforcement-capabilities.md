# ADR-008: Verify native blocking capability before claiming enforcement

## Status

Accepted mock contract; native integrations planned, no native acceptance date asserted. Consolidated 2026-11-11.

## Context

A native hook that emits a lifecycle event may be observational, asynchronous or unable to stop the operation. Engine decisions and local write completion do not prove provider receipt or compliance.

## Decision

Bind capabilities in trusted adapter code, refuse unsupported events before policy instantiation, and require verified native blocking/refusal/transport semantics before claiming provider enforcement. Current support is the local mock only.

## Consequences

No Claude, Codex or Gemini native `agent.beforeSpawn` enforcement is claimed. Future adapters must require a matching complete allow response, handle all failure paths and document provider/version scope. FinOps/DLP/RTK remain future interchangeable modules.

## Considered alternatives

Treating event emission as enforcement fabricates a guarantee. Advisory telemetry may be useful but must be labelled observation. Generic fail-open transport would violate the mock refusal contract.

## Evidence and implementation references

[Mock capability check](../../src/mock-provider.ts), [mock CLI](../../src/mock-provider-cli.ts), [policy contract](../provider-policy.md), [capability matrix](../capabilities.md).

## Date and revision

The date above records consolidation or a reliably identified implementation revision,
not an invented historical approval meeting. See the linked original evidence.
