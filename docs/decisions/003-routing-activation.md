# ADR-003: Explicit routing and cooperative PATH activation

## Status

Accepted implemented routing; documented here 2026-11-11 at main `b562cbf`.

## Context

Project launchers enter Arch only when selected. Core strips marked routing directories from native PATH; provider snapshots, shell rc files, aliases and direct executable paths can change command resolution.

## Decision

Support explicit Arch entrypoints and project routes. Treat implicit PATH interception as cooperative activation, never an OS security boundary or mandatory nested interception.

## Consequences

Explicit nested calls can enter fresh middleware scopes. Status cannot certify parent-shell activation. Absolute native calls bypass Arch; implicit provider-shell behavior must be tested per environment.

## Considered alternatives

Inherited PATH prepending cannot override every provider snapshot/rc file and risks reentry. Provider adapters may offer future convenience but require a native contract. Mandatory OS interception is a separate architecture. Production mise command wrappers were rejected after unconfigured-project failures; selected routing uses local launchers.

## Evidence and implementation references

[Native environment](../../src/process/native-environment.ts), [resolver](../../src/process/executable-resolver.ts), [routing spike](../validation/arch-routing-activation-spike.md), [routing investigation](../architecture.md#routing-decision-and-evidence).

## Date and revision

The date above records consolidation or a reliably identified implementation revision,
not an invented historical approval meeting. See the linked original evidence.
