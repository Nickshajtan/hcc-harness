# VS-1 — Claude Code consumer validation

Executed 2026-11-03 local time (Europe/Kiev); some raw timestamps are 2026-11-02 UTC.

The independently installed snapshot successfully routed real Claude Code print
requests, a bounded edit, and interactive startup/exit. CMD and Windows PowerShell
transport checks passed. This is a qualified consumer-validation result, not a
claim that current upstream main, every terminal behavior, or historical Windows
reliability incidents are validated.

## Snapshot and ownership

- Validated SHA: `769a1f6f80adf0dc594105c793bce941986b132c`, from
  `fix/stable-runtime-alias-lifetime`, based on the PR #18 B2 merge.
- **Baseline deviation:** task requested current main after PR #19. Local main
  predates B2, local origin/main stops at PR #18, and GitHub fetch was blocked by
  SSH known-host access and HTTPS certificate/Windows credential restrictions.
  The user explicitly confirmed use of this available fix snapshot. PR #19/current
  upstream equivalence is **NOT VERIFIED**.
- External evidence workspace: `D:\AI\arch-validation` (exFAT).
- Actual consumer and installation: a new uniquely owned
  `%TEMP%\arch-vs1-<unique-id>` directory on NTFS, explicitly approved by the user.
  Its exact location is recorded externally in
  `evidence/claude-vs1/ntfs-workspace.txt`.
- Layout: `installed-arch/`, `consumer-claude/`, `native-probe/`, `evidence/`, and
  separate owned raw-lifetime fixture directories. No consumer files are in this
  repository. No preexisting directory was deleted.
- Source was cloned separately into the external workspace. This report is the
  only maintained repository change; production code is unchanged.

Installation used the documented B2 interface:

```powershell
$env:ARCH_WINDOWS_SDK = '10.0.17763.0'
$env:npm_config_offline = 'true'
npm.cmd ci --offline --ignore-scripts --no-audit --no-fund
npm.cmd run install:stable -- --destination "$workspace\installed-arch"
Set-Location "$workspace\consumer-claude"
& "$workspace\installed-arch\arch.exe" init claude
```

The default SDK 10.0.19041.0 failed with C1083: missing
`specstrings_strict.h`. The already installed complete SDK 10.0.17763.0 built
successfully using the documented selector. No SDK was installed or modified.

The installed identity is `arch-stable-installation-v1`, platform `win32`.
All **88** recorded resource hashes matched after validation. Bootstrap SHA-256:
`5d7fda0feec4223c31dd200911b55e167ccc581cccae189dafec7dec01f17045`.
The generated Claude shim targets only the installed `arch.exe`, with
`args = run claude --`; it contains no source-checkout reference. Renaming the
entire validation source copy away did not prevent routed `--version`; the copy
was then restored. No npm link or source-relative launcher was used for the consumer.

## Host, native CLI, and activation

Windows 10 build 19045, x64; Node v24.19.0 from the existing nvm Windows selection.
Claude Code **2.1.280** is the existing native Windows executable at
`%USERPROFILE%\.local\bin\claude.exe`, not an npm shim. No Claude copy was
installed and no update channel was changed. Auth metadata indicated a logged-in
`claude.ai` account and first-party provider. Credentials and complete environments
were not collected.

The TUI displayed **API Usage Billing** despite the initial subscription
assumption. After the first request, inference was paused and the user confirmed
personal API billing for the two remaining requests, each capped at $0.15.
The initial auth status did not establish subscription billing; this is an
execution-process lesson, not an Arch defect.

AvastSvc/AvastUI processes were present. CIM OS, volume, and antivirus inventory
queries were denied; Windows version and filesystem identity were obtained using
.NET. Avast configuration was never changed.

Mise was not available. Stable status correctly reported valid initialized
ownership, no pending recovery, and unverified shell activation. Tests used either
the explicit generated launcher or a **child-local** PATH, ordered as:
project `.arch/bin`, owned native-probe directory, native Claude bin, System32.
Global PATH and shell profiles were not changed. This proves explicit routing,
not real mise activation. A generic `vs1probe` route was added only to the disposable
consumer for transport characterization.

## Scenario results

Evidence names below are relative to the external `evidence/claude-vs1/` directory.

| Scenario                                                          | Direct                | Routed                                 | Verdict                       | Evidence                                                           |
| ----------------------------------------------------------------- | --------------------- | -------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| CMD and PowerShell version                                        | PASS                  | PASS                                   | PASS                          | `transport.json`                                                   |
| Claude help/stdout completion                                     | PASS                  | PASS                                   | PASS                          | `direct-help.txt`, `routed-help.json`                              |
| Invalid option/error identity                                     | PASS, exit 1          | PASS, exit 1                           | PASS                          | `direct-invalid.json`, `routed-invalid.json`                       |
| Exact quoted/spaced/Unicode/metacharacter arguments, native probe | PASS                  | PASS                                   | PASS                          | `transport.json`                                                   |
| Probe cwd, stdin, stdout, stderr, exit 7                          | PASS                  | PASS                                   | PASS                          | `transport.json`                                                   |
| Real read-only project inspection                                 | PASS, exit 0          | PASS, exit 0                           | PASS                          | `direct-inference-summary.json`, `routed-inference-summary.json`   |
| Real bounded edit                                                 | NOT TESTED            | PASS, exit 0                           | PASS for routed scenario      | `routed-fix-summary.json`, `ntfs-evidence/consumer-test-after.txt` |
| Real PTY startup, trust screen, ANSI, Ctrl+C exit                 | PASS observed subset  | PASS observed subset                   | PARTIAL                       | Tool PTY sessions 46433 and 48861; observations below              |
| Resize, terminal disconnection, in-flight inference cancellation  | NOT TESTED            | NOT TESTED                             | NOT TESTED                    | No measurements; manual procedure below                            |
| Native Claude with no Node on PATH                                | NOT TESTED separately | PASS                                   | PASS                          | `transport.json`                                                   |
| Invalid ARCH_NODE                                                 | Claude still exits 0  | Arch exits 1 with bootstrap diagnostic | PASS                          | `transport.json`                                                   |
| Source copy unavailable                                           | N/A                   | PASS                                   | PASS                          | `transport.json`                                                   |
| Raw executable lifetime, NTFS and exFAT, sequential/concurrent    | PASS                  | PASS                                   | PASS for bounded observations | `raw-*/evidence.json`                                              |
| Historical executable EPERM mechanism                             | Existing raw failure  | Not attributed to Arch                 | UNRESOLVED                    | Historical record identified below                                 |
| Historical npm help timeout/cleanup EBUSY mechanism               | Unestablished         | Unestablished                          | UNRESOLVED                    | Historical diagnostics and focused suite                           |

The native probe is a locally compiled, dependency-free C# executable. It emits
base64-encoded argv, cwd, one harmless sentinel and ARCH_NODE, reads stdin to EOF,
writes a known stderr sentinel, and exits 7. Both shells preserved:
`quoted string`, a path with spaces, `Україна`, and `literal & symbol`.
Direct/routed output and status matched byte-for-byte within each shell. No secret
environment values were emitted. This is exact probe-argv evidence; Claude's
version mode ignoring extra arguments alone would not establish that contract.

The first custom CMD test failed before either target because the test launcher
used Node's default Windows quoting for cmd.exe's raw command string. Both direct
and routed cases failed. The evidence remains in `transport-first-attempt.json`.
Using `windowsVerbatimArguments` for cmd.exe fixed the test launcher. This was a
confirmed **test-infrastructure defect**, with no production change required.

## Real inference and permission behavior

Exactly **three** inference-bearing CLI invocations were made; no stability
repetition or recursive agents were used. Each had a $0.15 print-mode budget cap,
a finite turn limit, safe mode, strict MCP configuration, and no session persistence.
The CLI-reported estimates were $0.0138674, $0.0154546, and $0.0202678:
**$0.0495898 total at reported list price**, not an assertion about invoice charges.

The direct and routed read-only calls independently identified the deliberate
`a - b` defect in the dependency-free sum project. The routed edit used restricted
mode with only Read/Edit tools, explicitly allowed; no permission-bypass flag or
shell tools were supplied. All calls reported zero permission denials and zero
spawned subagents. The edit changed only `sum.js` among the four known root files,
from subtraction to addition. README, package metadata and test hashes remained
unchanged. The test changed from expected failure (`-1` versus `5`) to passing.
The model did not execute the test; the operator-side validation did.

Restricted mode confined edit tools to the working directory. This is not a
machine-wide audit proving every possible write was inside the consumer: native
Claude trust/settings or updater activity is distinct from model edits, and no
machine-wide file monitor was installed.

## Runtime, terminal, and process observations

Arch selected its own Node via ARCH_NODE while native Claude ran with no Node on
the test PATH. An invalid ARCH_NODE stopped Arch with an explicit missing-runtime
diagnostic; direct native Claude still succeeded under the same override. This
supports native executable/runtime separation. Required authentication continued
to work through the routed requests; credentials were not rewritten by Arch.

Captured invocations reached both exit and close; stdout/stderr were complete for
the bounded probes and Claude results, with no probe truncation. Missing-runtime,
Claude option error, successful completion, and user key cancellation were recorded
as distinct observations. The test launcher timeout was not hit. No claude process
remained in the final process-name inventory; this is **not descendant containment**
or proof about unknown external handles.

Both direct and generated-launcher sessions used the execution tool's real PTY,
not piped print mode. Workspace trust screens, input handling, ANSI screen updates,
the normal Claude prompt, Ctrl+C exit and terminal-restoration sequences were
observed. Both ultimately returned exit 0. No model prompt was submitted in either
interactive session. The routed TUI also displayed an auto-update failure; this
was not repaired, and no updater or authentication command was run.

Raw Ctrl+C key input handled by the TUI is not proof of Windows console control
event propagation during inference. Terminal resizing was unavailable through the
chosen execution API, disconnection was not injected, and further inference would
exceed the authorized request count. **Full interactive acceptance: NOT TESTED**;
the measured startup/exit subset passed. There is no fabricated resize or
in-flight cancellation result.

Operator-assisted completion, with a separately authorized inference budget:

1. In a real Windows Terminal tab, enter the disposable consumer. Run the native
   absolute Claude executable, then the generated `.arch\bin\claude.exe`, with
   the same options. Confirm project identity and rendering.
2. Type and erase an unsent harmless prompt; use arrow keys, resize in both
   directions, and confirm redraw and input behavior.
3. If inference is authorized, submit one bounded read-only request and test
   Ctrl+C while it is active. Record the shell's exit code, close behavior and
   test-owned process cleanup separately from idle TUI exit.
4. Test normal `/exit` and terminal closure separately. Do not reuse unrelated
   sessions or terminate processes by name.

## Windows reliability investigation

Owned fixtures used copies of trusted System32 cmd.exe, not real Claude or unknown
executables. Each condition performed 16 fresh-copy/delete checks plus 16
execute/close/delete cycles: four sequential iterations and three concurrent
independent lanes of four. The four conditions were direct NTFS, routed NTFS,
direct exFAT, and routed exFAT: **64 execution cycles total**, all passed without
retries. Routed execution used the NTFS consumer even when the native fixture was
on exFAT. This does not claim project initialization on exFAT is supported.

Existing historical evidence in the original checkout,
`reports/native-lifetime/37ff384a-f8f6-4e6a-8937-eb559ed4ba7d.json`, records
2026-11-02 raw EPERM at copy, lanes=3, lane=0, iteration=3, with a retained fixture.
Because it occurred outside Arch routing, Arch is not necessary for that observed
failure. Antivirus, image lifetime, third-party handles and scheduling remain
undistinguished. A pass today does not repair that failure. **Executable locking:
UNRESOLVED.** No handle tracing or antivirus A/B experiment was performed.

The three historical npm-help diagnostic JSON records inspected contained
missing-executable spawn failures (-4058), including an explicitly missing cmd
fixture. They do not establish the reported timeout/EBUSY cause. The focused
current npm CLI suite passed, which also does not establish a historical repair.
**npm-help hang and cleanup EBUSY: UNRESOLVED.**

## Checks and final acceptance

- PASS: offline dependency installation, TypeScript build, documented stable
  installation with explicit complete SDK, installed resource integrity.
- PASS: focused `npm.cmd test -- tests/integration/npm-cli.test.ts
tests/integration/native-lifetime.test.ts`: **7 passed, 1 skipped**, two files.
  The existing Windows skip is the POSIX SIGINT/SIGTERM npm-linked signal test;
  it is not claimed as tested on Windows.
- PASS: consumer test after controlled edit and transport/lifetime probes above.
- No production changes or confirmed Arch integration defects. Full coverage,
  mutation remeasurement, full check and cross-platform portability matrix were
  not run for this documentation-only change; no gates were weakened.

| Acceptance area                         | Result                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| Independent consumer boundary           | PASS                                                            |
| Native Claude execution                 | PASS                                                            |
| Real non-interactive routed integration | PASS                                                            |
| Full interactive terminal acceptance    | NOT TESTED; startup/exit subset passed                          |
| Native runtime isolation                | PASS for installed native Windows executable                    |
| Filesystem/process safety               | PARTIAL; owned probes settled, no global write/descendant audit |
| Windows executable locking incident     | UNRESOLVED                                                      |
| Windows npm-help/cleanup incident       | UNRESOLVED                                                      |
| Requested current-main baseline         | NOT VERIFIED; alternate snapshot explicitly approved            |

The generic transport is supported by this bounded Claude consumer evidence.
Before a broader readiness claim or Gemini milestone, verify current main,
complete interactive measurements, and retain the unresolved Windows incident
workstream. No new provider adapter or broad architecture change is justified by
these results. Nothing was committed, pushed, merged, or published automatically.
