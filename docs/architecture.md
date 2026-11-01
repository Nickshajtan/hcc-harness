# Architecture

## Routing decision and evidence

Selected: **project-local launchers with a minimal Node dispatcher**, activated by
mise's `env._.path`. Mise manages Node and bootstrap tasks. There is no production
mise `[wrappers]` configuration and no parallel routing strategy.

Before implementing the fallback, we tested mise **2026.10.11 windows-x64** in
isolated A/B/C projects with fake executables. Its documented
[command wrappers](https://mise.jdx.dev/dev-tools/shims.html#command-wrappers)
support fixed arguments, precedence, project configuration, and cleaned child PATH.
[Shell aliases](https://mise.jdx.dev/shell-aliases.html) alone do not support all
required shells or scripts. Tasks require a different command name.

The initial `mise exec -- claude` experiment passed A/B/C, subdirectory discovery,
project switching and argument forwarding. The subsequent plain `claude` test
exposed an essential gap: once a persistent wrapper shim exists, invoking it from
unconfigured Project C or outside projects returns **“claude is not a valid shim”**,
even with `not_found_system_fallback=true`. A/B plain commands work. Thus the
explicit `mise exec` result was insufficient evidence for the required native
command workflow. The custom fallback was selected only after this failure.

Reproduce with `npm run experiment` (mise required). `tests/feasibility/mise.test.ts`
asserts argument preservation and configured A/B behavior, records both plain and
explicit-exec outcomes, and saves `.test-state/mise-<platform>.json`. On other
platforms the direct unconfigured outcome is measured rather than assumed. This
experimental prototype is test code only. Its output is distinct from the
acceptance suite, which requires every selected-router scenario to pass.

The dispatcher is the config discovery/native passthrough boundary in `execute()`.
Unix project launchers `exec` Node using `"$@"`. Native Windows launchers reuse
[Scoop's C++ shim](https://github.com/ScoopInstaller/Shim/tree/cpp/v0.3.0), with no
runtime dependencies; provenance, checksums and license are in `vendor/`.
They launch the same Node entry point and preserve the raw argument tail. This
avoids both custom native code and batch argument parsing in production.

Mise discovers `.config/mise/conf.d/arch.toml` and puts `.arch/bin` on PATH. It uses
its own normal trust and activation rules. Within a shell with stale project PATH,
the dispatcher still discovers configuration from the actual cwd: A's launcher can
correctly execute B or native C. It removes every directory bearing the exact Arch
marker from the native child's PATH and rejects recursive Arch execution. It also
rejects realpath aliases to managed launchers. No global binary or shell profile
is overwritten. Existing aliases/functions may take precedence over PATH.

## Lifecycle and contracts

`core.ts` forwards the public API to `core/index.ts`. Its `execute()` prepares the native environment, refuses recursion, then
discovers the nearest configuration. Without configuration it resolves and launches
the native command directly, with no configured event lifecycle. Invalid configuration
and recursion fail before a context exists.

For configured execution, the facade freezes the identity, original arguments, cwd,
project root and signal into an execution context, then creates one `ExecutionSession`:

- `core/execution-session.ts` owns the execution-local bus, pipeline, current stage and
  native result. `run()` reads as start/observe, register, native lifecycle, finalize,
  terminal publication. Factories are selected after awaited started observers and
  instantiated in TOML order. Disabled entries never instantiate factories.
- `core/execution-failures.ts` retains error objects in observation order and the first
  failing stage. It produces the existing AggregateError message/cause; nonzero
  native exit statuses remain results rather than failures.
- `core/execution-environment.ts` composes a fresh environment: middleware overrides
  replace case-insensitive native keys on Windows and exact keys on POSIX; the
  execution identity becomes ARCH_ACTIVE. It does not select a runtime or alter PATH.

These are internal modules, not new supported entrypoints. Two small stateful
objects encapsulate lifecycle and failure history; the environment operation is pure.
No inheritance, service container, process adapter or new middleware API is involved.

The session resolves the native executable before `preflight`, then runs
`preflight -> prepareLaunch -> native process -> finalize`. Cleanup follows finalization
on success and after registration, resolution, denial and launch failures. Pipeline
finalizers and reverse-order cleanup retain their existing aggregation. Secondary
finalize/disposal errors cannot replace the primary execution stage. Terminal events
follow cleanup, then the bus is disposed even if publication fails. A terminal
publication infrastructure rejection retains its existing precedence over the execution
aggregate; ordinary observer/reporter failures remain contained by EventBus.

`hookable` owns hook dispatch. Arch exposes `context`, `on(phase, handler)`,
`setEnv(name, value)`, and `cleanup(handler)`. Hooks run sequentially. Identity,
original arguments, cwd and the executable cannot be changed by the API. Environment
patches are accepted only during preparation, reject NUL/invalid names and reserved
routing variables, and reject conflicting values (case-insensitive keys on Windows).
Middleware can throw to deny launch. Registry factories and mutable launch state
are fresh for each execution. Modules are trusted local code; no security sandbox
or dependency graph is implied.

## Events

Emittery 2.1 supplies the underlying bus. Its listener API delivers `{ name, data }`;
the adapter exposes only typed Arch event envelopes. The four types are
`execution.started`, `middleware.completed`, `execution.completed`, and
`execution.failed`. Middleware completion identifies the phase and module; it is
emitted after each successfully completed handler. Final completion/failure is
emitted after cleanup. Envelopes and their flat payloads are frozen.

Delivery is **awaited**, using Emittery's concurrent subscriber semantics. Arch
makes no ordering promises between subscribers. Every subscriber exception is
caught and reported separately; failures in the reporter are contained too.
Observer initialization errors use the same diagnostic path as subscriber errors,
retain their original error object, and do not change middleware decisions. Returned
observer/reporter promises are awaited and rejected promises are contained.
There are no retries, persistence, remote transport, durable/cross-process guarantees,
or event authorization gates. Observers cannot clear a caught middleware error or
cause the core to launch a rejected operation. Trusted observers that never settle
can delay execution; they should finish promptly. Listener sets are per execution
and cleared after its terminal event. Events contain no original argument list,
environment values, or raw exception payloads. Optional trace output stays local.

## CLI and Wizard boundaries

`cli.ts` retains the executable/shebang, historical run syntax and top-level
error/exit mapping. `cli/native-run.ts` owns signal subscriptions, trace registration
and native result mapping; it still delegates execution to Core and removes
subscriptions before reflecting a native signal. No process policy moved into CLI.

`commands.ts` forwards its existing exports. `cli/parsing.ts` returns a discriminated
management request without filesystem effects; terminal availability is an input.
`cli/dispatch.ts` directly selects lifecycle operations and owns confirmation-resource
cleanup. `cli/presentation.ts` formats status without authorizing mutation. Management
syntax errors remain exit 2; malformed run syntax remains exit 1. Explicit requests
do not load readline, legacy uninstall never prompts, and deinit defaults to confirmation.

`wizard.ts` is a compatibility facade. `wizard/terminal.ts` owns readline and its
EOF/SIGINT behavior; dispatch closes it in finally. `wizard/workflow.ts` inspects,
navigates configuration, selects commands, confirms and invokes the same lifecycle
operations. Configuration returns select/changed/unchanged; input cancellation
returns before mutation. Stateless decisions preserve distinct setup-Yes/removal-No
defaults; presentation retains the existing installation/activation wording.
There is no parallel ownership engine, command framework or shared mutable session.

The uninstall incident remains UNRESOLVED; the controlled Windows sharing refusal
is a verified failure contract, not an established explanation of that incident.
See the [stability evidence and readiness assessment](standards/quality-baseline.md).

## Processes and platforms

`process.ts` is an export-only compatibility facade. The internal `process/` modules
have these responsibilities:

- `native-environment.ts`: exact router-marker detection and fresh native PATH filtering.
- `executable-resolver.ts`: ordered PATH/PATHEXT candidates and filesystem/realpath validation.
- `windows-npm-shim.ts`: supported shim interpretation, Node shebang validation and
  native adjacent/PATH Node selection. It never selects Arch's runtime.
- `launch.ts`: abort checks around asynchronous preparation and shell-free spawn.
- `child-lifecycle.ts`: one `ChildExecution` owns a child's cancellation subscription,
  settlement callbacks and escalation timer. Stateless lookup/adaptation remain functions.

Child state moves from running to cancellation requested or directly to settled.
Only the first error/close settles and removes listeners/timer. An observed exit
suppresses cancellation while close is pending. Synchronous kill events are checked
before installing escalation; a false kill result remains pending rather than
claiming completion. Escalation still targets only the direct child after three seconds.
These modules do not import Core, lifecycle or CLI coordinators. Core calls the facade;
platform-specific shim policy does not belong in execution orchestration.

Node `spawn` uses `shell: false` and inherited stdin/stdout/stderr. Arch preserves
cwd and argument strings, avoids output buffering, and waits for the native child.
Native resolution checks PATH entries and actual files, avoiding only directories
with Arch's exact routing marker (including realpath aliases). Directory names such
as `mise/shims` or `command-wrappers/bin` alone never disqualify a native executable.
The execution-local `ARCH_ACTIVE` guard remains the last recursion defense when an
external wrapper routes back into Arch. It is set for both configured execution
and native passthrough; passthrough emits no harness events or middleware activity.
Native executable absence fails explicitly. On Windows, npm's
`read-cmd-shim` resolves standard `.cmd` launchers to their targets; Node shebang
scripts use the standard shim's adjacent Node when requested, otherwise native
PATH Node; neither Arch's runtime nor ARCH_NODE is a fallback. Native targets launch directly.
Arbitrary `.bat`/non-npm `.cmd` files fail instead of entering a shell.

SIGINT, SIGTERM and SIGHUP abort the current execution. On POSIX, the signal is
forwarded to the direct child with a 3-second SIGKILL fallback. Cancellation and
settlement have separate idempotency guards: startup aborts are rechecked, exited
children are not killed, and at most one escalation timer can exist. Both child
listeners, the abort listener, and the timer are removed at settlement. A child-originated
POSIX signal is reflected by re-signalling the CLI after cleanup. On native Windows,
Ctrl+C and Ctrl+Break are console events; the direct child normally receives them
through its inherited console as well. Arch handles them and terminates a remaining
direct child with Node's Windows termination operation. The result may be the
conventional 130/149 or native `STATUS_CONTROL_C_EXIT` (0xC000013A) if native exit
wins the signal-delivery race. Native statuses are preserved. Windows has no POSIX
SIGTERM delivery; forced termination cannot guarantee finally blocks. This is not
a process-tree supervisor: grandchildren are owned by the launched tool.

## Bootstrap and extensions

### M2 project lifecycle

`setup.ts` forwards all historical exports. `installation/setup.ts` coordinates
exclusive initial writes, recorded ownership and rollback; `installation/renderer.ts`
renders resources without inspecting project state. Its CLI/vendor URLs explicitly
retain setup's historical anchors in both source and built artifacts. Byte contracts
cover POSIX quoting and Windows executable/shim payloads; this move does not rebind
existing resources or implement B2. `lifecycle.ts` is an export-only
compatibility facade over `lifecycle/index.ts`, which coordinates public route operations.
The internal responsibilities are:

| Module under lifecycle/ | Responsibility                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| manifest.ts             | Recorded ownership parsing, hashes, route layout/completeness and identity                 |
| ownership.ts            | Safe component checks, optional reads and recorded-hash verification                       |
| routing-plan.ts         | Filesystem inspection, route classification and retained-hash planning; no publication     |
| routing-journal.ts      | Journal header, manifest relationship and addition payload validation                      |
| routing-files.ts        | Specific stage verification/creation, exclusive hard-link publication and optional removal |
| recovery-validation.ts  | Read-only verification of allowed before/after states and staging evidence                 |
| recovery.ts             | Explicit ordered recovery effects and unchanged checkpoint callbacks                       |
| removal.ts              | Ownership-checked uninstall and its persisted removal checkpoint                           |
| inspection.ts           | Read-only state classification, activation observations and middleware diagnostics         |

Manifest/ownership/journal helpers never import lifecycle coordinators or setup.
Coordinators compose those helpers; route planning imports the renderer directly,
not the installation coordinator. Lifecycle imports removal directly, rather than
through setup's compatibility facade. The renderer uses shared manifest layout
constants, while recorded ownership remains entirely a lifecycle responsibility.
No new classes, filesystem repository, generic transaction mechanism or mutable global
operation state is needed. Ownership checks do not themselves grant permission to delete:
the caller must select the existing operation/recovery policy. In particular, absent
files are accepted by uninstall verification only after its removal checkpoint exists.

`discovery.ts` uses native PATH resolution without
executing candidates. `commands.ts` forwards CLI dispatch and `wizard.ts` adapts
terminal selections to the same services. Core, events, middleware and native
process execution contracts are unchanged. There is no new interaction dependency.

Installation states derive from bootstrap and operation journals: uninitialized,
initialized, recovery_pending, invalid_state. Valid ownership on disk is independent
of shell activation: status reports mise presence and PATH presence, and leaves
parent-shell activation unknown. Init success does not prove active routing.

M1 manifests remain unversioned `{ files, createdHarness }`; their recorded hashes
and original captured launcher paths remain authoritative. Completeness checks for
healthy routing do not require today's renderer output or JSON property order.
Uninstall retains safe ownership-based handling even for legacy manifests from
which a complete route set cannot be inferred. The frozen M1 generator fixture is
tested against M2 inspection, repeated initialization, reconciliation and removal.

Route reconciliation preserves shared launchers, the router marker, mise integration
and harness ownership. A versioned `.arch/routing.json` stores before/after manifests
and base64 payloads for new launchers, without environment values or credentials.
Complete sibling staging writes are published with exclusive hard links for new
destinations. Ordinary rename cannot provide portable no-replace semantics; it is
used only to replace the already-owned bootstrap after validation. Additions are
verified before old launchers are removed; the journal is removed last after cleanup.
Windows exe/shim pairs use the same protocol. Unsupported hard links, Windows
sharing failures and ownership mismatches produce errors with checkpoints retained.
The journal does not make an entire route set atomically visible or guarantee
power-loss durability. Partial private staging writes are preserved for inspection
and restoration, and pre-journal orphan staging is never guessed to be owned.

Recovery accepts absent additions/removals only where the recorded plan permits
them; retained files must still exist and match. Bootstrap must match old or new
ownership. A different desired set is rejected until recovery finishes. Confirmed
deinitialization completes an interrupted route update before normal uninstall.
Conflicting removal/routing journals and symlinked managed paths block mutation.
Only one mutator per project is supported; journal exclusivity detects conflicts
but is not a general interprocess lock or defense against hostile filesystem races.

`deinit` confirms with default No, requiring `--yes` outside TTY. Deprecated
`uninstall` remains prompt-free for M1 compatibility. Both use the same removal
service and preserve existing ownership/recovery behavior. Interactive init/configure
have deterministic `init <commands...>` / `configure <commands...>` equivalents;
menu inspection/removal map to `status` / `deinit --yes`.

The publication decision is deliberately narrow: a journal explains interrupted
ownership, but cannot authorize overwriting a destination that appears after
preflight. Ordinary rename lacks portable no-replace semantics; exclusive copy
could expose a truncated live launcher. Hence hard links publish complete new
files/journals exclusively, while staged rename replaces only already-owned state.
Unsupported links fail without an alternate algorithm. See
[compatibility](compatibility.md) and [test evidence](testing.md).

### Existing bootstrap guarantees

Setup writes only owned files with exclusive creation. It records SHA-256 hashes,
validates repeated setups, refuses collisions, and rolls back files created by a
failed setup. If rollback also fails, AggregateError preserves the original setup
failure first and as cause, then the cleanup failure. Rollback still stops at its
first failed unlink and leaves remaining evidence intact.
Uninstall checks all hashes before removing any managed file, then
atomically renames the unchanged ownership manifest from `.arch/bootstrap.json` to
`.arch/uninstall.json` before the first deletion. Retrying from this checkpoint
allows already-absent managed files while verifying every remaining file. A fresh
uninstall still rejects unexpectedly missing files. The manifest is retained through
deletion/configuration errors and removed last; errors identify the operation and
affected path. Initialization is refused while that checkpoint exists. Edited or
preexisting harness configuration remains. Generated launchers capture absolute
runtime/checkout paths. Missing targets do not invalidate unchanged ownership;
use a working current Arch for explicit deinit/init [rebind](usage.md).

New local module factories are registered explicitly in the registry without
changing routing or lifecycle code. For example, add a factory to `defaultRegistry`
in `src/core/index.ts`, build, and enable its id in TOML:

```ts
import type { ArchMiddleware } from './middleware.js';
export function example(): ArchMiddleware {
  return {
    id: 'example',
    register(api) {
      api.on('preflight', () => {
        api.context.signal.throwIfAborted();
      });
      api.on('prepareLaunch', () => {
        api.setEnv('MY_TOOL_MODE', 'local');
      });
      api.cleanup(() => {
        /* release execution-local resources */
      });
    },
  };
}
```

Register `['example', example]`; factories must create execution-local state.
Programmatic consumers may pass a registry and observe the per-execution bus through
`execute()`. Current APIs, not the retired milestone spec, define the contract.
M2.2 B1 is verified feasibility; B2 remains planned and requires separate approval.
The [active portability design](runtime-portability.md) records those boundaries.
Provider SDKs/loops, dynamic downloads, remote events, storage, MCP/skills/context,
sandbox/DLP/budget systems, persistence and orchestration remain outside this MVP.
