# ADR-002: Independent nested Arch executions

## Status

Accepted for F1-F5 stabilization. Baseline: `b4c3523`; merged in PR #24
(`d028df2`). Original decision text retained below; headings and references were
consolidated on 2026-11-11.

## Context

Inherited `ARCH_ACTIVE` proves only process ancestry, not router recursion.
Rejecting it blocks legitimate agent chains. Native passthrough was rejected
because it suppresses middleware, execution initialization, policy hooks and events.

## Decision

Every invocation creates a new execution ID and owns its pipeline, bus, outcome
and cleanup. This also applies without discovered configuration, using an empty
pipeline. Each child receives the current ID as `ARCH_PARENT_EXECUTION_ID`;
the next invocation validates its bounded shape and copies it to optional
`parentExecutionId` in middleware context and schema-1 events. `ARCH_ACTIVE`
remains a current-execution compatibility field. Environment correlation is
untrusted, may be forged, and never grants permissions or ownership.

Native resolution removes marked Arch directories and canonicalizes executable
paths before rejecting marked targets, the Arch CLI, recognized generated shell
launchers, generated Windows shim arguments and stable installation entries.
Windows npm destination checks remain active. No candidate means an explicit
failure. Agent ancestry has no global depth limit. Arbitrary third-party scripts
cannot always be classified statically, so intentional wrapper reentry remains
native program behavior; these checks do not claim universal wrapper analysis.

## Consequences

Middleware ordering and failure/cleanup semantics apply independently at every
level; every event identifies its current execution and optional parent, including
middleware and terminal events. No shared mutable execution tree or new backend is
introduced. POSIX terminal SIGINT is left to OS group delivery after spawn, avoiding
forwarding multiplication through nested Arch layers. SIGTERM/SIGHUP remain the
programmatic direct-child cancellation policy.

OS/sandbox permissions and existing policy hooks define effective security.
Absolute native invocation can bypass PATH routing. Scheduling, RPC, sandbox
adapters, mandatory interception, policy inheritance and budget aggregation remain
outside Core. Future accounting must distinguish executions from billable model
requests. No budget contract changes here.

The original `arch-review-spec.md` and `claude-code-vs1-macos.md` were unavailable
locally. The supplied corrective specification governs this implementation,
especially rejection of the original review's native-passthrough recommendation.

## Considered alternatives

Rejecting inherited `ARCH_ACTIVE` confused ancestry with recursion. Native
passthrough suppressed the nested middleware and event scope. Both were rejected;
canonical target checks retain recursion safety without an agent ancestry limit.
A universal execution tree, policy inheritance and model accounting remain separate
future contracts, not implicit extensions of parent correlation.

## Evidence and implementation references

[Core context](../../src/core/index.ts),
[environment composition](../../src/core/execution-environment.ts),
[native resolution](../../src/process/executable-resolver.ts),
[stabilization record](../stabilization-f1-f5.md),
[Windows control](../validation/arch-windows-control-acceptance.md),
[WSL2 control](../validation/arch-wsl2-control-acceptance.md).

## Date and revision

The original note establishes the F1-F5 baseline; no historical approval date is
asserted. PR #24 merge revision and separate execution dates appear in the linked
records. Documentation format consolidation: 2026-11-11.
