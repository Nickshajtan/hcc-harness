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
external wrapper routes back into Arch. Native executable absence fails explicitly. On Windows, npm's
`read-cmd-shim` resolves standard `.cmd` launchers to their targets; Node shebang
scripts launch with the running Node executable, native targets launch directly.
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
runtime/checkout paths, so moving either requires uninstall/reinitialization.

New local module factories are registered explicitly in the registry without
changing routing or lifecycle code. Future RTK integration should use this contract.
Provider SDKs/loops, dynamic downloads, remote events, storage, MCP/skills/context,
sandbox/DLP/budget systems, persistence and orchestration remain outside this MVP.
