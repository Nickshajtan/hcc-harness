# Windows PTY cleanup hardening

2026-11-09. **Verdict: GO for the isolated Windows test-driver contract.**
The driver uses supported Node process APIs and node-pty public APIs only.
It exits explicitly after verified session completion; it does not exit naturally.
The parent independently verifies actual exit and captured process settlement.
No Arch production source, provider configuration, PATH configuration or security
setting was changed. No merge or commit was made.

## Tested revision and prerequisites

Exact base commit: `d028df2d4d76da17bc730234a866316449c04d53` in
`Nickshajtan/hcc-harness`, checkout `arch-windows-control-source`.
Results describe this base plus the uncommitted files listed below, not an
invented post-change commit. The previous lifecycle report, observer, adapter and
driver were already untracked when this task began; they were inspected directly.
The original acceptance report was read from the surrounding acceptance workspace.
Its diagnostic environment is not a prerequisite of the new regression.

| Component   | Tested                                             |
| ----------- | -------------------------------------------------- |
| Windows     | Windows 10 x64, 10.0.19045.0                       |
| Node        | Native Windows v24.19.0                            |
| node-pty    | 1.1.0, unchanged exact development dependency      |
| ConPTY      | System backend, useConpty=true, useConptyDll=false |
| Compiler    | .NET Framework64 v4.0.30319 C# compiler            |
| Windows SDK | 10.0.17763.0, invocation-local selection           |

Reproduce from a dependency-prepared checkout with the existing Windows native
build prerequisites and cached production dependencies:

```powershell
$env:ARCH_WINDOWS_SDK='10.0.17763.0'
npm run test:pty:cleanup
```

This builds Arch and its existing bootstrap/publication helpers, compiles the two
test fixtures, installs an isolated stable Arch snapshot and initializes a scratch
project. It needs no provider executable, authentication or inference. The compiler
and bootstrap build are real prerequisites: missing prerequisites fail, not skip.
The runner uses offline npm materialization. Linux/macOS skip this Windows-only
ConPTY regression; their existing terminal contracts remain unchanged.

## Existing ownership and root cause

Imports are in `scripts/check-wizard.mjs`, `scripts/b1/check-tty.mjs`,
`scripts/b1/check-runtime-tty.mjs`, the focused Windows fixture, and the POSIX-only
foreground-PTY test in `tests/integration/stabilization.test.ts`. No runtime Arch
module imports node-pty. Wizard/B1 already use standalone drivers and explicit
process exit; they do not independently prove ConPTY helper settlement. This work
does not claim a new acceptance run of those entire suites.

The previous focused fixture owned one PTY per subprocess, ignored driver stdin,
retained subscriptions and used a pinned private adapter after onExit. Historical
acceptance originally treated onExit as sufficient and discarded subscriptions.
The standalone driver is the smallest existing owner suitable for this correction;
no PTY proxy, replacement driver or general framework was introduced.

Installed `typings/node-pty.d.ts` exposes onData/onExit listener disposables and
kill(), but no IPty.dispose(). Inspection of installed Windows JS confirms that
natural exit closes the output socket, while the input pipe and conout worker can
remain referenced. The public shell exit notification is not full settlement.
The native pseudoconsole is also contained by driver process lifetime. This is
an upstream dependency lifetime limitation, independently reproducible without Arch.

## Approaches A, B and C

| Approach              | Evidence and decision                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: public PTY cleanup | Listener disposal alone is insufficient. The fresh native cmd probe returned PTY status 7, disposed both listeners, disconnected IPC, and still held PipeWrap/MessagePort/PipeWrap after five seconds, without beforeExit. Its recovery timer was unreferenced, so it could not itself prevent natural exit. No public PTY dispose exists. |
| A: post-exit kill     | Installed code enumerates the exited shell console and has a five-second PID fallback. The earlier lifecycle investigation observed AttachConsole failure. Not a safe post-exit disposal contract; no new kill experiment was necessary.                                                                                                   |
| B: dedicated driver   | Selected with an explicit Node process-exit contract. Natural driver exit remains insufficient, as the fresh public-only probe demonstrates. OS process teardown releases only this driver's workers, pipes and native handles; no process enumeration is used to terminate anything. All eleven final cases verify helpers separately.    |
| C: private adapter    | Unnecessary under B's tested process boundary. Removed all private field access from `scripts/windows-pty-resources.mjs`; no adapter compatibility surface or dependency upgrade is needed. The older report remains historical evidence.                                                                                                  |

The deliberate `process.exit(code)` is confined to the dedicated IPC driver and
runs after session verification, synchronous evidence writing, subscription disposal,
stdout/stderr flushing, and completion-message delivery. Shell code 7 is a tested
session result; driver code 0 means the expected result was verified, not that the
shell returned zero. Initialization failure returns driver 2 without fabricating a
PTY exit. Parent acceptance additionally requires the completion event, correct PTY
status, real child close, no signal, expected output/route identity and helper waits.
Thus a premature successful process exit cannot satisfy the test.

This is not an in-process resource-release API and must not be used inside Vitest
workers or long-lived applications. Existing multi-session wizard/B1 scripts were
not rewritten. The helper's one-session subprocess boundary is its public contract.

## Normal completion, failure and interruption

Driver stdin is ignored; stdout/stderr/IPC belong to the parent. Subscriptions are
disposed, streams flushed, and IPC disconnected before explicit driver exit.
The parent waits for `close`, not just `exit` or printed success text. It samples
process identities at driver-ready, fixture-ready, PTY exit and driver-complete.
A native fixture reports its executable image, Arch execution identity and echoed
terminal input. Routed tests assert the same native image and a nonempty ARCH_ACTIVE.

The controlled timeout begins after confirmed terminal input. Its 250 ms duration
is the intentional fixture deadline, not a sleep used to assume resource cleanup.
It sends a real PTY Ctrl+C. The fixture otherwise waits indefinitely, so cancellation
is observable. Native cancellation additionally requires PTY_INTERRUPTED output.
Arch may terminate its native child before that message is written: routed checks
require exit 130, completed I/O and absence of the whole captured route chain.
This follows the existing Windows console cancellation contract, rather than
requiring a new child-handler-delivery guarantee from Core.

Normal cleanup and failure recovery are separate. A twelve-second driver watchdog
records failure, requests Ctrl+C and uses a three-second diagnostic self-exit bound.
If the watchdog fires, session verification fails even if the expected code later
arrives. The parent allows twenty seconds for actual close and five seconds for
captured identity settlement. Observer subprocesses have ten-second bounds. No
parent/helper termination path exists. If normal cleanup fails, evidence and scratch
installation are retained and the test fails. Emergency cleanup is intentionally
not automated; arbitrary unresponsive applications are not promised clean recovery.

## Focused regression results

| Case                              | Shell/native PTY exit | Driver exit | Residual captured processes |
| --------------------------------- | --------------------- | ----------- | --------------------------- |
| Native cmd normal                 | 0                     | 0           | 0                           |
| Native cmd controlled nonzero     | 7                     | 0           | 0                           |
| Native executable normal          | 0                     | 0           | 0                           |
| Native executable nonzero         | 7                     | 0           | 0                           |
| Native Ctrl+C                     | 130                   | 0           | 0                           |
| Native controlled deadline        | 130                   | 0           | 0                           |
| Missing executable initialization | No PTY exit           | 2           | 0                           |
| Stable Arch routed normal         | 0                     | 0           | 0                           |
| Stable Arch routed nonzero        | 7                     | 0           | 0                           |
| Stable Arch routed Ctrl+C         | 130                   | 0           | 0                           |
| Stable Arch routed deadline       | 130                   | 0           | 0                           |

**PASS: eleven cases**, final run `run-00s755` after the watchdog failure guard
was added. Native cases complete before routed cases. Every captured
identity settled; the unrelated sentinel remained alive with unchanged creation
time and image, then exited on its own stdin EOF. Stable deinit and first-attempt
removal of the complete scratch installation, fixture executables and observer
succeeded. Diagnostic JSON is retained under ignored `.test-state/windows-pty-cleanup/run-*`.
No raw environment dump or temporary process log is included in deliverables.

Additional checks: **PASS** TypeScript no-emit typecheck, scoped ESLint, scoped
Prettier, build and native bootstrap/publication builds with the selected SDK.
**PASS** existing Windows Ctrl+C/Ctrl+Break integration test: one passed, sixteen
selection skips. **NOT TESTED:** Linux/macOS execution, full wizard/B1 acceptance,
Windows 11, other node-pty versions/backends, provider TUIs or full reliability suite.
POSIX PTY/signal code and skips are unchanged; no private Windows APIs were added
to any POSIX path. The existing Windows C# observer is read-only process inspection.

## Process ownership evidence

Every captured identity includes PID, parent PID, creation FILETIME/UTC, full image
path, executable category and current exited state. Waits open a process handle,
check captured creation time against the current process, and classify reused PIDs
as not owned. A PID alone is never termination authority. This test terminates no
process, owned or foreign. Snapshot disappearance races are represented explicitly.

For example, the passing `run-DfCzk7` native-normal snapshot observed driver 12672
created at FILETIME 134387283225008286, startup conhost 892 at
134387283225063259 and PTY conhost 18264 at 134387283227754756, both with parent
12672 and image `%SystemRoot%\System32\conhost.exe`. Fixture 16316 was beneath the
same driver and had the exact generated scratch executable image.
The routed snapshot showed driver 4276, its two conhosts, generated route 15708,
stable arch.exe 17944, CLI Node 10344 and the intended native executable 9308.
All were absent after completion. These numbers identify historical evidence only.
The final verification also writes a separate run directory rather than overwriting
a failed attempt. Native helper topology was four captured processes; routed was
seven; initialization captured two. These counts are observations, not hardcoded
platform assumptions. No continuous kernel trace or complete handle inventory is claimed.

## Failed attempts retained

The initial default-SDK build failed on missing `specstrings_strict.h` in SDK
10.0.19041.0. The already-documented 10.0.17763.0 selection built successfully.
An initial native assertion failed because Node's VT stripping left an X from a
ConPTY control sequence; the fixture now uses the prior report's explicit OSC/CSI
removal. A later routed-interrupt assertion required a native handler's output;
its failure evidence was copied before adjustment into
`.test-state/windows-pty-cleanup-interrupt-diagnostic`. Exit was 130 and residue zero.
Existing console integration assertions confirmed the platform's termination
contract. No Core change was made. Invalid compiler-relative-path and inherited
`--input-type` probe invocations created no PTY and are not lifecycle evidence.
The corrected public-only probe is `.test-state/public-api-result.json`; it records
retention followed by diagnostic driver exit 2 and captured process settlement.
Failed fixtures are retained, not counted as clean passes.

## Changed files and limitations

- `package.json`: reproducible `test:pty:cleanup` entry point; no dependency change.
- `scripts/test-windows-pty-cleanup.mjs`: self-contained compilation, isolated stable
  installation, route setup, regression invocation and successful fixture removal.
- `scripts/check-windows-pty-lifecycle.mjs`: permanent eleven-case parent observer,
  bounded real-close/helper checks, sentinel and per-run diagnostics.
- `scripts/fixtures/windows-pty-driver.mjs`: deterministic one-session driver,
  public subscriptions, input/cancellation validation and explicit failure recovery.
- `scripts/windows-pty-resources.mjs`: public process-boundary completion helper,
  replacing the experimental private adapter.
- `tests/fixtures/windows-pty-session.cs`: native executable with explicit lifetime,
  identity, input and cancellation behavior.
- `tests/fixtures/windows-pty-processes.cs`: existing untracked read-only observer,
  retained unchanged as a required reproducible fixture.
- `docs/testing.md`, this report and the historical lifecycle report's supersession note.

The limitation is explicit self-exit of a dedicated Windows driver, not a repaired
node-pty native implementation. The dependency remains development-only and pinned
at 1.1.0; later upgrades should rerun this regression and reevaluate natural exit.
Snapshot-based observation cannot prove absence of an entirely transient process
that appears and disappears between barriers. Unexpected persistent descendants
are checked at the final scan as well as through captured identity waits.
There is no indiscriminate kill, private-field dependency or forced-cleanup PASS.

**Final verdict: GO**, scoped to this process-isolated public lifecycle contract
on the tested Windows environment. Linux/macOS runtime evidence remains NOT TESTED.
