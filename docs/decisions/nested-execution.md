# Decision: independent nested Arch executions

Status: accepted for F1-F5 stabilization. Baseline: `b4c3523`.

Inherited `ARCH_ACTIVE` proves only process ancestry, not router recursion.
Rejecting it blocks legitimate agent chains. Native passthrough was rejected
because it suppresses middleware, execution initialization, policy hooks and events.

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
