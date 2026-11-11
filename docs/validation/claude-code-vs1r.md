# VS-1R — Windows Claude Consumer Regression

Executed 2026-11-04–05 (Europe/Kiev). Validation only; no production changes,
paid inference, commits, PRs, deployment, security changes or global shell changes.

## Baseline and evidence

Upstream main: `b4c35238614e1df7dc696b05bb286ae6c34b2825`, PR #23 merge,
**FS-1.2 included**. Tree: `0d6cb93f29ea57b108ba9202a6f05f11cfdbb806`.
The original checkout and previous VS-1 checkout were preserved.

Ordinary HTTPS Git fetch failed: configured CA file inaccessible; Windows schannel
also returned `SEC_E_NO_CREDENTIALS`. No TLS checks were disabled. The connected
GitHub API fetched fresh main metadata. An independent local clone supplied its
existing tree/parents. Reconstructing GitHub's signed commit from its verification
payload/signature produced **the exact upstream commit hash**, then detached
checkout succeeded. This is verified main, not a renamed feature snapshot.
Working tree was clean before validation; the maintained report is its only change.

Raw evidence and driver scripts remain outside the repository. Evidence root:
`D:\AI\arch-validation\evidence\claude-vs1r` (called **E** below).
`config.json` records exact original consumer, installation and tool paths;
`config-controlled.json` records the second NTFS consumer. These user-specific
paths are deliberately excluded from the maintained report. All fixtures remain
owned disposable directories. No historical failure fixture was deleted.

Previous VS-1 report: external validation checkout's
`docs/validation/claude-code-vs1.md`, SHA `769a1f6`. It established qualified
NTFS-consumer compatibility, explicit routing and three authorized inference calls;
it did **not** establish current main, exFAT consumer lifecycle or genuine mise.
Those historical inference results are retained, not rerun or upgraded to VS-1R.

FS-1.2's maintained acceptance record and original external evidence were reviewed,
including `external-consumer-diagnostic.json`, sharing-handshake failures,
`retained-consumer-orphan-before-termination.json` and Restart Manager results.
The earlier raw EPERM record
`reports/native-lifetime/37ff384a-f8f6-4e6a-8937-eb559ed4ba7d.json`
was also revisited. Later passes do not erase those failures.

## Environment and independent installation

| Item              | Observed                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Windows           | x64, 10.0.19045.0                                                                           |
| Node              | v24.19.0, existing nvm selection                                                            |
| Shells            | Windows PowerShell 5.1; Windows CMD                                                         |
| Claude Code       | native Windows executable, 2.1.280, existing personal installation                          |
| mise              | 2026.10.11 windows-x64; existing binary copied into owned NTFS tools directory              |
| Arch installation | fresh stable snapshot on verified NTFS                                                      |
| Consumer A        | uniquely owned NTFS temporary directory; replacement controlled NTFS consumer also recorded |
| Consumer B        | uniquely owned directory on actual D: exFAT, outside every source checkout                  |
| Terminal host     | Windows ConPTY through node-pty 1.1.0; distinct from either shell                           |

Filesystem types were queried using .NET DriveInfo against actual directory roots,
not inferred from letters (`host.json`). D: reports a fixed volume; this validation
does not independently establish an externally attached physical device.

Native Claude resolves to the existing user-local `claude.exe`, outside `.arch`.
Its binary SHA-256 is
`0e4195524b73eb77efbdf3e2b36de5322a29f0ca575dfd2d9b4f946b1d425469`.
Direct CMD and PowerShell `--version`, `--help`, and deliberately unknown option
completed with expected 0/0/1 status before routing (`records-baseline.json`).
No probe was substituted for these real CLI calls.

Installation commands, from the exact disposable source checkout:

```powershell
npm.cmd ci --offline --ignore-scripts --no-audit --no-fund
$env:ARCH_WINDOWS_SDK = '10.0.17763.0'
$env:npm_config_offline = 'true'
npm.cmd run install:stable -- --destination "$owned\installed"
```

Dependencies/build/install passed (`npm-ci.log`, `install.log`). The known complete
installed SDK was selected as in VS-1; no new compiler/runtime/download was added.
The consumer requires neither compiler nor network downloads. Mise's test-local
configuration/cache is offline. Stable entrypoints and recorded shims refer only
to the installed tree, never npm link or source CLI. Runtime override tests below
are explicit process-local diagnostics, not consumer prerequisites.

## CMD, PowerShell and genuine mise

| Filesystem | Shell      | Real CLI version/help/invalid | Native probe | Mise route proof                 |
| ---------- | ---------- | ----------------------------- | ------------ | -------------------------------- |
| NTFS       | CMD        | PASS                          | PASS         | PASS, explicit `mise exec`       |
| NTFS       | PowerShell | PASS                          | PASS         | PASS, activation and `mise exec` |
| exFAT      | CMD        | PASS                          | PASS         | PASS, explicit `mise exec`       |
| exFAT      | PowerShell | PASS                          | PASS         | PASS, activation and `mise exec` |

The 32-call parity matrix compares direct executables with
`mise exec -- claude <args>` or `mise exec -- vs1probe <args>` launched by each
shell (`records-parity.json`, `parity-checks.json`). Version/help stdout and exit
codes matched exactly; invalid option returned 1. Each routed invocation emitted
one `execution.started` event for the correct consumer, excluding recursive
routing or native passthrough. Trace/demo middleware intentionally adds routed
stderr diagnostics; these are visible in raw evidence, not silently normalized.

The dependency-free native C# probe separately proves exact quoted/spaced,
Unicode (`Україна`) and metacharacter (`literal & symbol`) argv, cwd, sentinel
environment, stdin, stdout, known stderr and exit 7. Probe stdout matched direct
execution byte-for-byte. Probe success is not model-inference acceptance.
CMD uses `/d /s /c` with explicit verbatim command transport, retaining the VS-1
test-harness quoting correction. PowerShell uses UTF-16 encoded commands.

PowerShell evaluated actual `mise activate powershell` output in a disposable
profile-free shell. Its generated prompt hook ran after directory changes.
`Get-Command claude` selected native before entry, the project launcher inside,
and native after exit; the inside version call emitted an Arch event on both
filesystems (`records-activation.json`). No profile was edited.

CMD interactive activation is unsupported by this mise: `mise activate cmd`
returns 2 and lists supported shells without CMD. Acceptance uses the supported
explicit `mise exec` path; interactive CMD activation is **NOT SUPPORTED**.
`mise exec -- cmd.exe /d /c "claude --version"` also emitted the correct Arch
event on each filesystem (`records-runtime.json`).

One diagnostic discrepancy remains: NTFS `mise exec -- where.exe claude` lists
only native Claude, whereas PowerShell command resolution and actual CMD execution
inside mise select Arch. The generated PATH contains mixed slash separators;
this is a possible explanation, **not an established cause**. exFAT `where.exe`
lists launcher then native. Raw first observations and follow-up are retained
(`records-activation.json`, `records-diagnostics.json`). Do not use `where.exe`
alone as route proof. This does not invalidate the measured Arch execution events.

## Runtime isolation

Both consumers passed native Claude without Node on child PATH; generated Arch
launchers also passed with Node absent from PATH and explicit valid `ARCH_NODE`.
Invalid override produced Arch bootstrap exit 1 with a missing-Node diagnostic;
direct native Claude remained successful with that same invalid override.
Ordinary earlier calls used Arch's normal runtime discovery, with no override.

The entire disposable source checkout was reversibly renamed unavailable;
mise-routed version still passed on both filesystems, then source was restored.
One Arch event per call, correct project root and native output support independent
execution without recursive discovery (`records-runtime.json`). Environment changes
were scoped to children. Global PATH, aliases and shell profiles were untouched.

## Lifecycle, ownership and recovery

Fresh setup/status/repeated setup passed for both real consumers; successful setup
left no `.arch/setup-claim`. Each added/removed `codex`, and deterministic IPC
interruption stopped a test-owned process specifically after publishing
`.arch/bin/codex.exe`. Status reported routing recovery pending; installed Arch
`configure claude vs1probe codex` recovered it, then route removal succeeded.
No arbitrary-timing kill or manual journal/claim deletion was used.

Foreign route collision was refused. Foreign file bytes and identity, plus unrelated
file bytes, survived deinitialization. Clean reinitialization/status passed on exFAT
and the separately controlled NTFS consumer. See `records-setup.json`,
`records-lifecycle.json`, `records-setup-controlled.json`,
`records-lifecycle-controlled.json` and `lifecycle-checks.json`.

**First-attempt test-orchestration failure retained:** the initial version loop
and lifecycle removal accidentally overlapped on the original NTFS consumer.
Deinit returned EPERM unlinking its actively executing Claude launcher; reinit
correctly refused pending uninstall. Later mise version attempts 8–10 reached
native fallback (zero Arch events) and are **invalid routed acceptance**, despite
exit 0. This is a confirmed overlapping-harness condition, not evidence of an
unexplained exFAT stall or a production repair. The original logs remain intact.
Documented `deinit --yes` subsequently resumed removal successfully, with no manual
ownership changes (`records-recovery-original.json`). A fresh NTFS consumer passed
the lifecycle with execution and mutation kept sequential. No failure was erased.

Pending/ambiguous setup-claim authority is additionally exercised by existing
real-process setup-publication and setup-authority suites, including foreign
bootstrap collision, actual termination, subsequent reader refusal and preservation.
No ambiguous setup claim was manually cleared for acceptance.

## Reliability and interactive observations

| Consumer        | Direct native            | Explicit project launcher | Supported mise path      |
| --------------- | ------------------------ | ------------------------- | ------------------------ |
| Controlled NTFS | 10/10 PASS, 3041–3135 ms | 10/10 PASS, 3272–3379 ms  | 10/10 PASS, 3351–3466 ms |
| Actual exFAT    | 10/10 PASS, 3075–3241 ms | 10/10 PASS, 3343–3529 ms  | 10/10 PASS, 3418–3661 ms |

**NOT REPRODUCED in 60 bounded acceptance attempts:** no native/launcher stall,
sharing failure or timeout in this controlled comparison. All 40 routed calls
contained exactly one Arch start event; every call reached exit/close, exit 0,
and expected real Claude version stdout. Each mode had ten sequential calls,
interleaved by iteration (direct, launcher, mise), 20-second individual deadlines
and eight-minute overall loop budgets. No parallel stress or per-attempt retries.
Evidence: exFAT half of `records-reliability.json`, and all of
`records-reliability-controlled.json`; command/argv/cwd/PID/streams/events/duration
are retained for every attempt. Shell transport is separately proven by the parity
matrix; these repetition drivers spawn processes directly, without a terminal host.

The additional first NTFS loop contains 30 calls, with the overlap defect described
above; it is not counted in the controlled 60. Three mise calls lost routing proof.
The fresh NTFS loop is an explicitly separate controlled experiment, not a retry
that replaces or erases those observations. A reproduced hang would remain FAIL;
none occurred here. Historical executable stalls, stage-sharing exceptions and
surviving-child incidents remain **UNRESOLVED, not FIXED**. No new causal evidence
attributes them to publication, shim, Claude, mise, antivirus or exFAT itself.

Four real TUI sessions used mise in ConPTY, 110×32, safe mode, strict MCP and Read
tool selection. Trust was accepted only for the disposable projects. All reached
the normal prompt with ANSI updates; an unsent line was entered, cursor movement
sent, then cleared. No model prompt was submitted.

| Consumer/shell     | Startup/trust/input | Measured termination                                                               |
| ------------------ | ------------------- | ---------------------------------------------------------------------------------- |
| NTFS / CMD         | PASS                | Ctrl+C pair, returned to shell; captured Claude exit 0                             |
| NTFS / PowerShell  | PASS                | Ctrl+C pair, returned to shell; captured Claude exit 0                             |
| exFAT / CMD        | PASS                | `/exit`, returned to shell, then shell exit 0; separate Claude status not captured |
| exFAT / PowerShell | PASS                | `/exit`, returned to shell; captured Claude exit 0                                 |

Raw ANSI transcripts/control events: `pty-<filesystem>-<shell>-controlled.json`.
Normal exit and Ctrl+C are thus measured in each shell, without claiming every
exit method in every filesystem/shell combination. Key input is not an injected
Windows console control event during active inference. Terminal resize,
disconnect and active-inference cancellation are **NOT TESTED**.

The first interactive driver mistakenly started with closed parent stdin; its
trust-screen session could not be controlled through that pipe. A nested PTY
attempt also had unreliable key translation. These are **harness failures**,
not accepted interactive results (`pty-first-harness-observation.json` and tool
session evidence). An explicit owned control-file channel then supplied keys to
ConPTY successfully. The stranded first session and its known owned process IDs
were terminated after preserving evidence; taskkill first returned access denied,
then targeted Stop-Process succeeded. No process-name-wide termination occurred.
Final process-name inspection found no Claude processes; this does not establish
machine-wide handle release or perfect descendant containment. CIM process-tree
diagnostics were denied, so that limitation remains explicit.

Native Claude displayed an auto-update failure, as in VS-1. PowerShell additionally
reported access denied for PSReadLine history; no history/profile/security repair
was attempted. Neither prevented the later measured startup/input/exit. TUI results
are terminal observations, not a screenshot-based visual quality claim.

Installed integrity verification matched **92/92** manifest resource hashes
(`installed-integrity.json`).

The first evidence assertion failed because the exFAT/CMD driver's saved transcript
lacks its final shell-exit event, although tool session 43577 completed with exit 0.
The original transcript remains unchanged. `pty-tool-completions.json` records the
separate observed tool completion; `checks-first-failure.json` preserves this
evidence-persistence gap. It does not supply a missing Claude-specific exit code.

Final installed status for both surviving consumers remained `initialized`,
`integrity: valid`, `recoveryPending: false` (`records-final-status.json`). Known
owned interactive process IDs were absent at final inspection. Running status
outside the child-local mise environment correctly warns that parent-shell
activation is unknown; this does not replace the measured activation evidence.

## Regression suites and CI

NTFS focused regression: **70 passed, 2 skipped, 0 failed**, 72 tests across stable
installation/runtime/interruption, native/setup publication, setup authority,
independent consumer and npm CLI suites (`regression-ntfs.json`). Skips are the
optional second-volume native publication case and existing POSIX npm signal case.

Actual exFAT: **27 passed, 1 skipped, 0 failed**, 28 tests across native publication,
setup publication, setup authority and independent consumer (`regression-exfat.json`).
The optional cross-volume case was initially skipped because its second-volume
variable was absent; a separately selected cross-volume run supplied the NTFS
destination and passed (`cross-volume.json`). Selection skips in that focused run are not
new platform coverage. Existing suites use real mise and native Claude version
via `ARCH_SMOKE_NATIVE`; no paid inference occurs.

Commands used `npm.cmd test -- <named suites> --reporter=json --outputFile=<E/file>`.
For exFAT, `ARCH_PUBLICATION_TEST_ROOT` named the owned exFAT directory;
`ARCH_PUBLICATION_OTHER_VOLUME` named owned NTFS for the selected cross-volume run.
No assertions, production timeout or test configuration were weakened.

Upstream main CI API inspection: all three workflow runs and their jobs completed
successfully, including Windows/macOS/Ubuntu runtime, regression and Wizard jobs:
[runtime](https://github.com/Nickshajtan/hcc-harness/actions/runs/41918795401),
[Arch checks](https://github.com/Nickshajtan/hcc-harness/actions/runs/41918795428),
[Wizard](https://github.com/Nickshajtan/hcc-harness/actions/runs/41918795288).
This is inspected job status, not a claim to have audited every hosted log.
`ci-summary.json` retains the job identities.

Full new mutation/coverage measurement was not run. The maintained FS-1.2 record
and retained current-source matching measurements supply that prior evidence;
their recorded amendment/version distinctions remain in force. Full local check,
all cross-platform runs and new mutation gates are outside this validation-only
slice; relevant focused regressions and inspected main CI are reported explicitly.

## Verdict and next slice

| Gate                                | Verdict                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| A — fresh upstream main with FS-1.2 | PASS, exact commit/tree verified through GitHub API and Git hashes                           |
| B — independent installation        | PASS, source unavailable and integrity checked; normal runtime discovery works               |
| C — CMD and PowerShell              | PASS for measured CLI/process contracts and listed TUI subset                                |
| D — genuine mise                    | PASS: PowerShell activation/leave and explicit execution; CMD explicit execution only        |
| E — native Claude                   | PASS for real non-inference CLI and TUI; paid inference NOT TESTED in VS-1R                  |
| F — lifecycle                       | PASS on controlled NTFS and actual exFAT; initial overlapping-harness failure retained       |
| G — ownership                       | PASS for measured foreign/unrelated files, interruption recovery and setup-claim regressions |
| H — reliability record              | PASS for transparent bounded exercise; historical incidents remain UNRESOLVED                |
| I — evidence                        | PASS with harness failures, skips and remaining gaps explicitly separated                    |

**Qualified Windows consumer regression acceptance.** Fresh independently installed
Arch on NTFS successfully routed real Claude from CMD and PowerShell for NTFS and
exFAT consumers. No production defect requiring a repair was established. This is
not a Windows executable-lifetime stability clearance, permanent reliability fix,
external-device certification or renewed paid-inference acceptance.

**Proceed to VS-1.1a — Git Bash as the next validation-only slice.** Carry forward
the NTFS installation/exFAT-consumer distinction, shell-resolution evidence,
bounded process settlement and unresolved Windows incidents. Verify MSYS argument
conversion, quoting/path translation, mise activation and TUI behavior explicitly.

**VS-1.1b — WSL2 may proceed afterward as a separate validation slice**, with its
own Linux runtime/native Claude installation and explicit Linux-filesystem versus
Windows-mounted-filesystem boundary. Nothing here establishes WSL2 behavior.
Git Bash/WSL2 investigation need not wait for an unsupported claim that historical
Windows incidents are fixed; broader release/stability readiness remains blocked
by those unresolved incidents under the repository's determinism policy.
