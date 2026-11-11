# ADR-001: Routed OS processes and provider ownership

## Status

Accepted implementation boundary; consolidation recorded 2026-11-11 at main `b562cbf`.

## Context

Logical agents and operating-system processes are different units. A native provider can create internal subagents without launching a new OS process. Treating each internal identity as an Arch execution would invent lifecycle and supervision evidence.

## Decision

Arch wraps actual routed invocations and supervises its direct child. The provider retains native subagent creation, model invocation, delegation and internal orchestration. Never fabricate child executions for in-process agents.

## Consequences

Process middleware has a concrete resource boundary. Internal provider activity is invisible unless a separately verified adapter supplies events; process lineage alone cannot provide model accounting or universal descendant control.

## Considered alternatives

A universal agent orchestrator or synthetic execution tree would require new contracts and native integration. Whole-process-tree supervision would change current cancellation/ownership semantics and is not the selected contract.

## Evidence and implementation references

[Core](../../src/core/index.ts), [session](../../src/core/execution-session.ts), [child lifecycle](../../src/process/child-lifecycle.ts), [delegation boundaries](../architecture.md#execution-and-delegation-boundaries).

## Date and revision

The date above records consolidation or a reliably identified implementation revision,
not an invented historical approval meeting. See the linked original evidence.
