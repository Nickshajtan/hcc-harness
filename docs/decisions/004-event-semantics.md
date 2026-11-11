# ADR-004: Independent decisions and observational events

## Status

Accepted; policy channel merged in PR #27 (`87c3480`), documented 2026-11-11.

## Context

EventBus contains observer/reporter failures and awaits concurrent subscribers. Those semantics cannot safely authorize a provider operation; telemetry success is not permission.

## Decision

Provider decisions call typed policy dispatch directly. Keep process-phase middleware, observational EventBus and provider-originated decision dispatch separate.

## Consequences

Policy failures fail closed in their own result; observers cannot erase denial. Each process execution and each policy request has its own registration/resource scope. Awaited observers can still delay execution if they never settle.

## Considered alternatives

Reusing EventBus as an authorization gate would conflate observation isolation with decision failure handling. A global decision bus would introduce shared identity/lifetime/transport contracts absent from this implementation.

## Evidence and implementation references

[Events](../../src/events.ts), [middleware](../../src/middleware.ts), [policy engine](../../src/policy.ts), [policy guide](../provider-policy.md).

## Date and revision

The date above records consolidation or a reliably identified implementation revision,
not an invented historical approval meeting. See the linked original evidence.
