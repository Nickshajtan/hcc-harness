# Architecture decisions

These ADRs record implementation boundaries and tradeoffs, not new feature
authorization. Accepted means consistent with the inspected implementation;
planned native integrations retain explicit verification gates. Consolidation dates
are not invented historical approval dates. Current overview: [architecture](../architecture.md).

| ID                                         | Decision                                                           |
| ------------------------------------------ | ------------------------------------------------------------------ |
| [ADR-001](001-process-boundary.md)         | Routed OS processes and provider ownership                         |
| [ADR-002](nested-execution.md)             | Independent nested executions; preserved original decision         |
| [ADR-003](003-routing-activation.md)       | Explicit routing and cooperative PATH activation                   |
| [ADR-004](004-event-semantics.md)          | Independent policy decisions and observational events              |
| [ADR-005](005-policy-registration.md)      | Synchronous policy registration; async handlers                    |
| [ADR-006](006-required-policies.md)        | Trusted required-policy applicability                              |
| [ADR-007](007-policy-failure-lifecycle.md) | Fail-closed decisions, cooperative deadlines and cleanup admission |
| [ADR-008](008-enforcement-capabilities.md) | Native blocking capability requires independent verification       |
| [ADR-009](009-test-pty-isolation.md)       | Windows PTY isolation belongs to test infrastructure               |

Each record uses Status, Context, Decision, Consequences, Considered alternatives,
Evidence and implementation references, and Date and revision. Preserve failures
and rejected alternatives when changing a decision; update evidence scope before
claiming a broader guarantee.
