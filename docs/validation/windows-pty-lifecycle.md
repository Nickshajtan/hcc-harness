# Windows PTY driver lifecycle

Historical investigation. The private adapter described below is superseded by
[cleanup hardening](windows-pty-cleanup-hardening.md), which tests an explicit
isolated process boundary without private node-pty fields.

2026-11-07, Europe/Kiev. **Verdict: CONDITIONAL GO — causally understood and
safely contained in test infrastructure. No Arch Core defect demonstrated.**

The native-only reproduction retained the driver and console helpers after shell
and PTY exit, just like the routed case. The version-pinned mitigation releases
the owned input socket and output worker after observed PTY exit, then lets an
isolated driver exit normally. Final native/routed success and exception cases,
plus failed initialization, settled without process termination. The underlying
node-pty native pseudoconsole lifetime is contained by one-session driver process
ownership; this is not an upstream library correction.

## Revision and environment

Base/source SHA: **`d028df2d4d76da17bc730234a866316449c04d53`**, the PR #24 merge.
The base checkout was clean. Changes are uncommitted standalone test scripts,
an observer fixture and this report; no `src/` or dependency change was made.
The acceptance artifact is local at
`D:/AI/arch-validation/docs/validation/arch-windows-control-acceptance.md`.

| Item         | Observed                                                        |
| ------------ | --------------------------------------------------------------- |
| OS           | Windows 10 x64, 10.0.19045.0                                    |
| Shell        | PowerShell 5.1.19041.6456                                       |
| Node         | Native Windows v24.19.0                                         |
| node-pty     | **1.1.0**, installed JS and native ConPTY source inspected      |
| PTY settings | system ConPTY: useConpty=true, useConptyDll=false; 140 × 35     |
| Avast        | User-reported temporarily disabled; environment limitation only |

No antivirus investigation, security setting change, provider configuration
change, inference, full acceptance rerun, WSL2/macOS test or automatic merge occurred.

## Observed topology and ownership

The original acceptance driver is external `control-finish.mjs`. The active Codex
command runner starts PowerShell, which starts this Node driver. The original
driver creates one PTY for each PowerShell/Git Bash session and records onExit,
but previously skipped disposal once onExit had fired and discarded listener
disposables. It did not await resource release or its own normal termination.

The focused regression adds a parent observer and a child per PTY. Measured trees
show the shell and conhost processes as **siblings under the driver**, not a
shell beneath conhost in the parent-PID tree:

```text
PowerShell tool shell
└─ Node regression runner
   └─ Node PTY driver
      ├─ conhost.exe (already present at driver-ready, before pty.spawn)
      ├─ conhost.exe (appears after system-ConPTY creation)
      └─ native copied cmd.exe
         OR generated route.exe → stable arch.exe → Node Arch CLI → copied cmd.exe
```

The first console host belongs to the isolated Windows driver process startup;
the second appears when node-pty creates its pseudoconsole. These observed roles
must not be inferred solely from historical PID numbers. The original two-session
acceptance driver's precise host-to-session mapping was not captured historically.

Every current captured identity includes PID, parent PID, creation FILETIME/UTC,
image path, command category and current exit state. The observer uses Toolhelp,
QueryFullProcessImageName, GetProcessTimes and process wait handles. Sampling races
are explicitly represented; a disappearing process is not authorization to kill
a replacement. Final regression code has no process-termination path.

| Resource                          | Owner and completion boundary                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Parent child-process pipes / IPC  | Runner owns pipe readers; driver disconnects IPC; runner awaits actual child `close` and status                         |
| Driver stdin                      | `ignore`; it cannot hold the driver waiting for input                                                                   |
| PTY input pipe                    | node-pty WindowsPtyAgent `inSocket`; adapter requests socket destroy and awaits close                                   |
| PTY output socket / output worker | WindowsPtyAgent / ConoutConnection; library closes output before onExit; adapter disposes worker and awaits Worker exit |
| Shell process handle              | Native node-pty exit thread waits for shell and closes its handle before JS exit callback                               |
| Native pseudoconsole handle       | Native node-pty driver process; isolated driver's normal OS exit is the final release boundary                          |
| onData / onExit subscriptions     | Driver retains and disposes both after resource settlement                                                              |
| Process observation handles       | Observer closes each handle in finally; waits verify captured creation identity                                         |

Native CreateProcess uses `bInheritHandles=false` with the pseudoconsole attribute.
Shell/Arch use that console's stdio, rather than owning the runner's IPC pipe.
This is source-backed ownership, supported by the measured process transitions;
no kernel trace of every duplicated Windows handle is claimed.

## Native-only versus routed baseline

Both ran the same deterministic interactive copied/native cmd shell, dimensions,
input `exit 7`, environment construction, ten-second startup bound and five-second
post-PTY-exit driver-settlement bound. Routed execution changed only the entry
to the generated stable Arch launcher. Neither involved a provider or model.

| Boundary, original exit-only driver     | Native-only                                        | Stable Arch route |
| --------------------------------------- | -------------------------------------------------- | ----------------- |
| PTY and shell created                   | Observed                                           | Observed          |
| Command readiness and orderly exit      | Observed                                           | Observed          |
| Shell / PTY exit status                 | 7                                                  | 7                 |
| Arch processes after PTY exit           | Not applicable                                     | Absent            |
| Driver normal close within bound        | **No**                                             | **No**            |
| Console helpers beyond completion bound | Persistent                                         | Persistent        |
| Diagnostic cleanup                      | Identity-validated termination, excluded from PASS | Same              |

Native driver PID 18088 and routed driver PID 18900 are **evidence identifiers
only**, never ongoing termination authority. Their snapshots and cleanup records
are retained. There was no native/routed divergence through PTY exit. The earliest
failed boundary in both was **PTY onExit → owned-resource release / driver close**.

## Cause and rejected alternatives

Inspected exact installed implementation:

- `lib/windowsPtyAgent.js`: the system-ConPTY natural-exit path eventually destroys
  the output socket, but does not close the input socket or dispose the conout worker.
- `lib/windowsTerminal.js` and `lib/terminal.js`: output close emits exit; `_close`
  changes readable/writable state and disables writes, rather than disposing all
  Windows agent resources.
- `lib/windowsConoutConnection.js` and its worker: the referenced worker owns a
  listening pipe server. Its disposal uses the library's existing drain timer and
  Worker termination. Leaving the worker referenced keeps the driver alive.
- `src/win/conpty.cc`: the native shell-exit thread closes the shell handle and
  invokes the JS callback; natural exit does not call ClosePseudoConsole in that
  path. The checked source's registry removal is inside an assertion; native
  prebuild compiler assertions were not independently reconstructed. Remaining
  native handle lifetime is therefore contained by isolated normal driver exit.

At original onExit, Node reported a live MessagePort and PipeWrap resources.
Closing the owned input socket and disposing its output worker allowed natural
beforeExit/exit, followed by absence of both helpers. This controlled resource
intervention supplies the causal evidence; helper presence alone was not treated
as proof of a leak.

Calling public `terminal.kill()` after onExit was evaluated and rejected. In this
version it starts a console-list child for the exited shell, emits
`AttachConsole failed`, then reaches a five-second PID-based fallback. It does
not provide the required safe post-exit disposal contract. A single installed
bundled-DLL mode probe also failed driver settlement; no dependency upgrade or
backend change was adopted. Disposing listeners alone cannot close these resources.

## Correction and containment

- `scripts/windows-pty-resources.mjs`: small explicit adapter for **Windows,
  node-pty 1.1.0, system ConPTY and verified private resource shape**. Refuses
  pre-exit release. Release is idempotent; it destroys only the owned input socket,
  asks the existing connection to dispose and awaits actual socket/worker events.
- `scripts/fixtures/windows-pty-driver.mjs`: one PTY per child; retains listeners;
  requests orderly shell exit on success and controlled exceptions; awaits PTY
  exit/resource release; disconnects IPC; never calls process.exit or PTY kill.
  Parent disconnect also requests orderly settlement. Initialization failure is
  recorded and exits normally when no terminal was created.
- `scripts/check-windows-pty-lifecycle.mjs`: awaits child close/status, observes
  topology at handshake boundaries and checks all captured identities settled.
  Native and routed cases use the same configuration and budgets. A separate
  sentinel remains unchanged until its own EOF shutdown.
- `tests/fixtures/windows-pty-processes.cs`: read-only process observer and bounded
  native process waits, not a termination utility.
- External acceptance `control-finish.mjs` now retains subscriptions, invokes the
  adapter after exit, awaits release on both completion/error paths and removes
  the old late `kill()` shortcut. Full acceptance was not rerun.

No new delay, deadline increase, broad retry, process.exit, forced process kill,
dependency change or Arch Core modification was used to produce passing results.
The existing library's drain timer was retained. Parent acceptance requires
driver close **and helper settlement**, not merely printed markers or onExit.

This mitigation deliberately uses private fields and relies on a bounded driver
process lifetime. It must not be generalized to long-running multi-session
drivers or another node-pty version without review. A session that refuses orderly
exit remains a failure with retained evidence; there is no force-to-green fallback.

## Focused verification

Build the observer with the installed .NET Framework C# compiler, then run from
the dependency-prepared checkout:

```powershell
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /r:System.Web.Extensions.dll /out:<observer.exe> '<checkout>\tests\fixtures\windows-pty-processes.cs'
node scripts/check-windows-pty-lifecycle.mjs <observer.exe> <copied-native-cmd.exe> <generated-stable-route.exe> <evidence-directory>
```

Measured execution checkout:
`C:/Users/38098/AppData/Local/Temp/arch-control-c0a9c000/source-unavailable`.
Final evidence: `D:/AI/arch-validation/evidence/windows-pty/final-regression/`.

| Final assertion                             | Shell / PTY status              | Driver normal close                   | Captured resources               |
| ------------------------------------------- | ------------------------------- | ------------------------------------- | -------------------------------- |
| Native normal                               | 7                               | 0, no signal                          | All absent                       |
| Native controlled exception                 | 9                               | 1, no signal; original error retained | All absent                       |
| Routed normal                               | 7                               | 0, no signal                          | All absent, including Arch chain |
| Routed controlled exception                 | 9                               | 1, no signal; original error retained | All absent, including Arch chain |
| Missing executable / partial initialization | No shell or PTY exit fabricated | 2, no signal                          | Driver/startup host absent       |

All five passed. Success/error paths asserted one release operation despite
repeated cleanup calls. No cleanup process termination was used. The first four
cases also passed before adding the explicit initialization assertion.

Existing control regression, run once:

```powershell
node node_modules/vitest/vitest.mjs run tests/integration/process.test.ts -t 'handles real Windows Ctrl' --maxWorkers=1 --reporter=default --reporter=json --outputFile=D:/AI/arch-validation/evidence/windows-pty/windows-control.json
```

**PASS: 1 passed / 16 selection skips**, 2.25 seconds, test 730 ms, exit 0.
This exercises both actual Windows Ctrl+C and Ctrl+Break with cleanup and native
child absence. No POSIX signal evidence was substituted.

Scoped ESLint, MJS syntax checks, TypeScript `tsc --noEmit`, observer C# compilation
and report/script formatting passed. No production/shared runner changed, so no
full suite or full CI was run. Stable installation creation passed; final deinit
and first-attempt removal of `pty-installed` and copied `pty-native` passed without
process termination. Captured identity waits confirmed no remaining helpers or
Arch processes; the sentinel stayed alive and unchanged during all cases, then
closed through its own stdin EOF.

## Failed diagnostics and evidence discipline

Original native/routed residue remains failed evidence, even though mitigation
passes. One kill-after probe's observer raced a disappearing process; that attempt
is invalid for settlement comparison. Two early regression attempts failed their
new readiness matcher (first line-boundary logic, then Node's VT-strip behavior on
these Windows sequences). Both are retained separately; no timeout was increased.
The final matcher removes OSC/CSI controls and matches actual output lines. The
second failed attempt's orderly finally cleanup completed, but the test remains
failed. A wrong-working-directory runner launch created no PTY and is not a test.

Read-only snapshot races now record unavailable entries instead of crashing the
observer. Failure evidence is saved before orderly diagnostic cleanup. Baseline
termination was limited to newly captured process identities after matching PID,
creation time and image; historical acceptance PIDs were never targeted.

The preparation invocation also briefly initialized routing in the report
workspace instead of the new disposable project. It was immediately deinitialized
with Arch's owned cleanup before testing; existing workspace files were preserved.
No user/provider configuration or production source was altered.

Raw evidence root: `D:/AI/arch-validation/evidence/windows-pty/`, containing
`native-original-*`, `routed-original-*`, the rejected probe records,
`invalid-readiness-matcher/`, `invalid-node-vt-matcher/`, `regression/`,
`final-regression/`, control JSON/logs and `artifact-cleanup.json`.
Only process identity/category and fixture output were collected; no credentials
or unrelated environment dump was required.

**Product correctness:** no divergence or retained Arch process demonstrated.
**Test infrastructure:** safely contained for the exact supported adapter and
isolated-driver contract; upstream node-pty lifetime behavior remains unchanged.
**Remaining scope:** Windows 11, arbitrary unresponsive applications, other
node-pty versions/backends and authenticated provider TUIs are untested. Avast
remains user-reported disabled; active-protection compatibility is outside this
investigation. No further security comparison is authorized or implied.
