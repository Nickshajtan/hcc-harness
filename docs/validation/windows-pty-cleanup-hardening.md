# Windows PTY cleanup hardening

Date: 2026-11-09. Tested base commit:
`65ff0a3b429f781d7c2f8a5a70dc3ff8809d0b8b`, plus the uncommitted changes listed below.
This records working-tree verification, not a claim that those changes already
belong to that commit. Verification preceded the implementation commit.

Environment: Windows 10 x64, OS release `10.0.19045`; Node `24.19.0`;
development-only `node-pty` **1.1.0**. The existing supplemental bootstrap
fixture also used real Node `20.19.0`. Windows SDK `10.0.17763.0` built the
publication helper and stable bootstrap. The default SDK `10.0.19041.0` failed
on missing `specstrings_strict.h`; selecting an already installed SDK resolved
that build prerequisite without system configuration changes.

## Existing design and defect

The two supplied historical report paths, `arch-windows-control-acceptance.md`
and `windows-pty-lifecycle.md`, do not exist in this checkout. Their unpublished
adapters were not assumed available. Repository search found no `inSocket` or
`ConoutConnection` adapter outside installed dependencies.

PTY owners were `scripts/check-wizard.mjs`, `scripts/b1/check-tty.mjs`,
`scripts/b1/check-runtime-tty.mjs`, and the POSIX-only foreground Ctrl+C case
in `tests/integration/stabilization.test.ts`. The standalone drivers imported
node-pty in their own process, waited for `onExit`, killed only unfinished
sessions, and finally called `process.exit`. Wizard stdin belongs to the PTY;
the new dedicated driver has ignored host stdin/stdout and reports over IPC.

Inspection of installed `typings/node-pty.d.ts`, `lib/windowsTerminal.js`,
`lib/windowsPtyAgent.js` and `lib/windowsConoutConnection.js` established:

- Public `onExit` reports PTY exit, not complete native-resource settlement.
- Event subscriptions have `dispose()`. The public terminal interface has no
  terminal `dispose()`; an implementation `destroy()` is not that public contract.
- The default ConPTY normal-exit path closes its output socket after draining,
  but does not destroy its input socket or dispose its output worker connection.
- Public `kill()` has additional teardown effects, including a console-list
  subprocess and delayed fallback. It is not equivalent to listener disposal.

A native `cmd.exe` fixture printed READY and exited 7. `onExit` reported 7,
but its Node driver and two owned conhost processes remained alive eight seconds
later. The diagnostic parent then terminated only its captured direct child;
all three observed identities disappeared. This was a failing baseline with
bounded recovery, not successful cleanup. No Arch code was involved.

## Approaches A / B / C

| Approach                                 | Evidence and decision                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: public PTY APIs in the existing owner | `onExit` alone reproduced the hang. Subscription disposal cannot close native resources. Post-exit `kill()` allowed a probe to finish, but emitted `AttachConsole failed` from node-pty's console-list agent and took its five-second fallback path. Rejected for normal completion.     |
| B: dedicated process per PTY             | Selected. Public spawn/write/onData/onExit and subscription disposal provide session behavior; OS process teardown releases this process's remaining native handles and worker threads. Parent independently checks results, child `close` status and observed owned process identities. |
| C: version-pinned private adapter        | Not needed. No private-field access, native ConPTY implementation, dependency replacement or upgrade was introduced. The existing exact dev dependency remains unchanged.                                                                                                                |

The explicit `process.exit(0)` is confined to the dedicated Windows driver,
after the parent has received its structured result, captured ownership and
acknowledged release. It is deliberate disposal of one session's process
boundary. IPC ordering preserves output before the result; the acknowledgement
proves receipt before exit. Driver status 0 is transport completion, not the
shell status or a passing test. Spawn failures still reject in the parent.
The supervising test runners exit naturally.

Successful sessions never use parent-forced termination or post-exit PTY kill.
The parent waits for actual driver `close`, requires a result and clean driver
status, then condition-polls for recorded processes to disappear. The normal
driver budget is 30 seconds; helper settlement has a 10-second budget, with
individual CIM queries bounded to 10 seconds. The 100 ms polling interval is
condition-based, not a fixed wait assumed to prove cleanup.

## Ownership and recovery

Read-only `Win32_Process` CIM snapshots record PID, parent PID, creation time,
executable path and name. Snapshot presence records an observed process, rather
than CPU activity; driver close status records its terminated state. Descendant attribution checks
parent relationships and creation ordering. Settlement matches PID, creation time
and executable path together, including observed Arch/native descendants.
Input is held until initial capture completes, keeping deterministic fixtures
alive for attribution. A second capture precedes driver release.

Normal cleanup disposes listeners and releases the process boundary after PTY
exit. Controlled cancellation calls public `kill()` while the fixture is active,
then follows the same exit/settlement protocol. node-pty can emit
`AttachConsole failed` even on this path; stderr is retained, not suppressed.
Cancellation returned native status `-1073741510` (`0xC000013A`) with zero
observed residuals. This upstream diagnostic is a remaining failure-path limit,
not evidence used to pass normal lifecycle tests.

For a hung driver, the parent terminates its captured `ChildProcess`, never a
PID found by process-name search. The resulting lifecycle rejects regardless
of subsequent settlement. It does not terminate helpers. Persistent observed
helpers cause failure with identity diagnostics and retained fixtures; no
emergency process-tree or global process cleanup is implemented.

## Focused verification

| Check                                                                       | Result                                                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Native shell normal/nonzero completion, input echoed as `RECEIVED:hello`    | PASS: PTY 0 / 7; drivers 0; zero observed residuals                                                       |
| Missing executable / PTY initialization failure                             | PASS: explicit spawn error; driver closed; zero observed residuals                                        |
| Native Ctrl+C fixture                                                       | PASS: `INTERRUPTED`, PTY 130; driver 0; zero observed residuals                                           |
| Controlled live-session public kill                                         | PASS settlement, with upstream console-agent diagnostic retained                                          |
| Premature driver exit negative control                                      | PASS detector: driver 0 without result rejected; zero observed residuals                                  |
| Hung driver negative control                                                | PASS detector: deadline rejection; direct-child forced recovery is explicitly not clean lifecycle success |
| Stable-installed generated `cmd.exe` router, input and exit 0 / 7           | PASS: intended system cmd executable observed; drivers 0; zero observed residuals                         |
| Stable Arch `run node.exe` Ctrl+C                                           | PASS: intended Node executable observed; PTY 130; driver 0; zero observed residuals                       |
| Isolated project deinit, scratch and stable snapshot removal                | PASS                                                                                                      |
| Existing Node 20 B1 PTY driver                                              | PASS: TTY handles, keyboard input and exit 9                                                              |
| Existing wizard terminal regression                                         | PASS                                                                                                      |
| Build, typecheck, lint, warning baseline, formatter and diff whitespace     | PASS after selecting installed SDK for bootstrap build                                                    |
| Linux/macOS execution and independent Node 22 terminal fixture on this host | NOT TESTED                                                                                                |

The initial Arch fixture attempted an absolute `run` target, then attempted to
register reserved `node` routing. Both were fixture errors rejected by existing
public contracts. Corrected fixtures route `cmd` and use public `run node.exe`
for Ctrl+C. Their failed logs were retained locally; no production behavior was
changed to accommodate them. `node` is deliberately not registered as a route.

Representative observed ownership from the successful full run:

- Native driver 6612, created `1794257434347` ms since Unix epoch,
  executable `<Node>/node.exe`; helpers 18668 and 7276, parent 6612,
  created `1794257434352` and `1794257434428`, system `conhost.exe` paths;
  native cmd 892, parent 6612, created `1794257434474`. All absent after settlement.
- Stable routed chain: driver 15480 → generated cmd router 13252 →
  stable arch 6160 → Arch Node 19384 → system cmd 10320. Conhost helpers
  4028 and 20236 were direct children of driver 15480. All absent afterward.
  PID 4028 had previously identified another driver; differing creation time
  and executable path kept the two identities distinct.

Full local evidence is generated at `.test-state/windows-pty-cleanup.json`;
console logs, baseline evidence and failed fixtures stay in ignored `.test-state`.
No environment dump or temporary process log is committed. Later reruns have
different identities; the examples above are historical observations, never
termination instructions.

## Changed files and reproduction

- `scripts/pty-driver.mjs`: one-session Windows owner and result/release protocol.
- `scripts/windows-pty.mjs`: narrow existing-driver facade, ownership snapshots,
  settlement deadline and diagnostic promise; alternate driver entry is a fault-test seam.
- `scripts/check-pty-cleanup.mjs`: native cases, protocol negative controls and
  optional isolated-stable-install cases through the same public test interface.
- `scripts/check-wizard.mjs`, `scripts/b1/check-tty.mjs`,
  `scripts/b1/check-runtime-tty.mjs`: Windows isolation and awaited settlement;
  remove explicit supervising-runner exit.
- `package.json`: `test:pty:windows` script only; dependency policy unchanged.
- `.github/workflows/runtime-feasibility.yml`: run native and stable cleanup regression on
  Windows and upload its structured evidence; required aggregate unchanged.
- `docs/testing.md` and this report: lifecycle contract and reproduction.

From a bootstrapped checkout, run `npm.cmd run test:pty:windows`. Only non-Windows
platforms skip this regression. Missing bindings, unavailable CIM access and
spawn failures fail explicitly. A standalone invocation reports stable cases as
NOT TESTED unless an isolated installed entry is supplied. The Windows CI step
now provisions a runner-local stable snapshot and supplies that entry explicitly;
the snapshot remains available through the PTY check and belongs to the disposable
runner, without altering the separate stable-runtime acceptance fixture.

For stable-install verification, build/install into a fresh absolute destination
using `npm.cmd run install:stable -- --destination <directory>`, then set the
process-local `ARCH_PTY_STABLE_ENTRY=<directory>\arch.exe` and run the same test.
The test creates/deinitializes its own project and removes successful scratch
files. Remove the isolated snapshot separately after all processes settle; it
does not own or automatically delete a supplied installation.

## PR #26 focused review follow-up

H1: Consumer callbacks previously ran directly in the IPC message handler. An
`onExit` throw could escape before the release acknowledgement was scheduled;
an `onData` throw could escape before later input-driving listeners ran. A local
shared dispatch helper now records synchronous listener exceptions and continues
dispatch. Ownership capture, result receipt and release remain on the existing
single-delivery path. Listener errors are raised only after driver close and
helper settlement. Diagnostics retain their stacks and an AggregateError cause
containing the original error objects, alongside any infrastructure failure.
Cleanup success does not convert a listener failure into session success.

Real native PTY negative controls register a deliberately throwing listener before
another listener. Both the onExit and onData cases reject with the original error,
deliver the later exit callback exactly once, complete input from the later data
callback, close the driver with status 0 and settle observed helpers to zero.
`timeoutRecovery` is recorded only when the driver deadline actually fires; both
listener controls assert that it did not fire. The deliberate hung-driver control
still exercises forced failure recovery separately.

Representative follow-up local evidence, from `.test-state/pty-review-native.json`:

| Listener     | Driver | Owned conhost PIDs | Driver status | Residuals | Timeout recovery |
| ------------ | ------ | ------------------ | ------------- | --------- | ---------------- |
| onExit throw | 11160  | 5480, 21428        | 0 / no signal | 0         | false            |
| onData throw | 17556  | 19648, 2968        | 0 / no signal | 0         | false            |

These records also include creation times and executable paths, as in the earlier
ownership evidence. Both controls were repeated successfully in the configured
stable run; their expected listener rejection is regression success, not a passing
PTY session. No global unhandled-exception handler or private node-pty API was added.

H2: Inspection of `stable-runtime.test.ts` found that its `afterAll` calls the
fixture disposer, removing the stable installation before the later PTY step.
Reusing its path would require extending another suite's fixture lifetime and
ownership contract. A disposable local installation from existing build artifacts
completed in about three seconds, without a rebuild. The narrow CI correction
therefore creates its own runner-local snapshot with `dist/install-stable.js`,
using the already recorded npm entry and compiled bootstrap. It does not repeat
the stable acceptance, copy/build another source checkout or install another Node
runtime. A failed install fails the step before PTY coverage can be claimed.
The step sets process-local `ARCH_PTY_STABLE_ENTRY` to the absolute generated
`arch.exe` and runs the unchanged stable cases in the regression's own project.

Structured evidence separates `coverage.native` and `coverage.stable`. Native
PASS is assigned only after its completion, listener and fault controls finish.
Stable PASS is assigned only after its actual PTY cases and project deinit finish.
When supplied, stable metadata must identify `arch-stable-installation-v1` on
Windows; evidence records `generatedStableRuntime: true` and the executable path.
Before identity verification, or when unexecuted, that field is null. Missing
configuration reports NOT TESTED with a reason; configuration/identity or case
failure reports FAIL, independently of native PASS.

Follow-up local checks (Windows, Node and node-pty versions unchanged):

- PASS: native completion 0/7, both listener controls, initialization failure,
  Ctrl+C, cancellation, premature driver exit and hang detection.
- PASS: configured generated stable router completion 0/7 and stable Arch Ctrl+C,
  zero observed owned residuals, project deinit and successful scratch removal.
- PASS: native-only run reports stable NOT TESTED with an explicit missing-entry
  reason; configured run reports stable PASS and generated-runtime identity.
- PASS: focused ESLint, typecheck, formatting and diff whitespace checks.
- NOT TESTED locally: POSIX execution; its terminal fixtures/import paths are
  unchanged by this review pass. No broad stabilization or mutation campaign ran.

Hosted evidence must be attributed to its actual head. The pre-review commit
`d86fc4168cff59a7b3852c95b8343638f1816fbe` had successful Windows/Linux/macOS
[runtime portability CI](https://github.com/Nickshajtan/hcc-harness/actions/runs/42699818697)
when inspected through gh. That workflow did not configure stable PTY cases and
did not contain the listener controls. It is not proof of the new coverage.
The follow-up results above are local evidence; the changed workflow requires
inspection of the final PR head's completed checks before a merge recommendation.

After pushing implementation commit `d476f02011139b2d47855667d0779777e15e7e37`,
the [updated hosted runtime run](https://github.com/Nickshajtan/hcc-harness/actions/runs/42706749574)
completed successfully on Windows, Linux and macOS, including the required aggregate.
Its downloaded `m22-runtime-windows-latest/windows-pty-cleanup.json` was inspected:
native and stable coverage both report PASS; the stable executable is the generated
`D:\a\_temp\arch-pty-cleanup-stable\arch.exe`, with `generatedStableRuntime: true`.
Both listener controls retain their errors, close drivers with status 0 / no signal,
and report zero residuals without timeout recovery. Actual stable PTY exits are
0, 7 and 130, with zero residuals and successful project deinit. This verifies
the new scenarios themselves, independently of the other stable-runtime tests.
All checks for that implementation head succeeded; the unrelated effects job was
SKIPPED by its existing workflow policy. Any subsequent documentation head still
requires its own final-head status inspection before declaring readiness.

## Limitations and verdict

**GO for this focused Windows test-infrastructure correction.** The root cause
is reproduced independently of Arch; normal sessions and real stable-routed
sessions settle without private APIs or parent-forced cleanup. Driver behavior
and transport success are independently asserted. Production `src/`, middleware,
providers, PATH/profile configuration and antivirus settings are unchanged.

Process observation targets deterministic, non-detaching fixtures and ConPTY
helpers. It is not general descendant interception or proof about arbitrary
detached workloads. CIM observation adds Windows test cost and requires access;
the restricted execution sandbox denied it, so process tests ran with approval
outside that sandbox. Successful process exit releases owned handles by OS
contract; no system-wide handle enumeration is claimed. POSIX keeps its original
node-pty implementation and signal path, but local execution cannot establish
Linux/macOS regression results. Hosted evidence is scoped to the inspected commit
as described above. Future node-pty
changes should rerun these checks and reconsider whether boundary disposal is
still necessary. Public-kill console-agent diagnostics remain documented.
