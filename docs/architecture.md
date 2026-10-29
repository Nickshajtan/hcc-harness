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

`execute()` discovers the nearest configuration, creates an immutable execution
context and event bus, registers fresh factories in TOML order, resolves the native
executable, and runs `preflight -> prepareLaunch -> native process -> finalize`.
Cleanup always follows finalization, including registration, resolution, denial,
launch, and finalization failures. All finalizers and cleanups are attempted; cleanup
callbacks run in reverse registration order. Errors are aggregated. A native nonzero
exit is a completed execution with its original status, not a middleware failure.
Malformed configuration and recursion fail before an execution context exists and
therefore do not emit an execution envelope.

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

## Processes and platforms

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

`setup.ts` retains M1 initialization/removal and exposes shared validation/rendering
primitives. `lifecycle.ts` provides read-only inspection, deterministic route plans,
reconciliation and recovery; `discovery.ts` uses native PATH resolution without
executing candidates. `commands.ts` parses the public CLI and `wizard.ts` adapts
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
failed setup. Uninstall checks all hashes before removing any managed file, then
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
in `src/core.ts`, build, and enable its id in TOML:

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
