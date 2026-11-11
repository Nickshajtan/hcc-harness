# VS-2.0 — Windows Gemini provider and agent routing validation

Executed 2026-11-05, Europe/Kiev. Validation only; zero Gemini model calls. No product source edits, PR, production installation changes, credential copying, profile edits, or global MSYS configuration changes.

## 1. Executive summary and verdict

**CONDITIONAL GO for measured non-inference CLI routing in Windows PowerShell 5.1 and Git Bash/MSYS2. Full interactive and arbitrary PowerShell quoting compatibility is not established.**

A fresh independently installed Windows Arch routed real Windows-native Gemini 0.55.1 from ordinary commands in activated interactive shells and from commands initiated by the current authorized Codex session. Actual installed Arch and Gemini process identities, parent relationships, cwd, selected environment values, routing events, outputs and exits were collected. Provider separation and owned-resource removal passed in both consumers.

There are two material qualifications: PowerShell 5.1 changes embedded quotes/empty arguments at different entry boundaries, producing a real native-versus-routed argument difference; and bounded unauthenticated TUI attempts did not establish a return to a functional shell after Ctrl+C. These are not demonstrated Arch executable defects. The same terminal limitation occurs directly, and the PowerShell corruption is already present when Arch receives its arguments.

| Gate                  | PowerShell | Git Bash | Accepted scope                                                                            |
| --------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------- |
| A Native provider     | PASS       | PASS     | Real version/help/invalid-option commands                                                 |
| B PowerShell routing  | PASS       | —        | Genuine prompt activation, leave/re-entry, explicit execution separately                  |
| C Git Bash routing    | —          | PASS     | Interactive Bash/mise, leave/re-entry and actual routed execution                         |
| D CLI parity          | PARTIAL    | PASS     | Version/help/invalid streams and codes equal; PS embedded-quote/empty-argument limitation |
| E Interactive runtime | PARTIAL    | PARTIAL  | PS login chooser; Bash terminal initialization only; complete TUI acceptance absent       |
| F Agent transport     | PASS       | PASS     | Current Codex session → controlled shell → installed Arch → real Gemini                   |
| G Environment/process | PARTIAL    | PARTIAL  | CLI cwd/env/stdin fixtures/normal exits pass; TUI cancellation/shell return unaccepted    |
| H Provider isolation  | PASS       | PASS     | Real Gemini and Claude, targeted removal, foreign-file preservation                       |
| I Evidence integrity  | PASS       | PASS     | Real-provider evidence separated from fixtures and excluded driver attempts               |

`PASS` applies only to the stated observations. `PARTIAL` means an observed subset passes while a required subset is incomplete or fails acceptance. `NOT TESTED` denotes unexecuted capabilities. No missing evidence is promoted to PASS.

## 2. Source SHA and environment inventory

Report workspace, resolved with `Get-Location`: **`D:\AI\arch-validation`**. This report is outside the HCC checkout and was never an Arch consumer.

Both shells used **`b4c35238614e1df7dc696b05bb286ae6c34b2825`**, tree **`0d6cb93f29ea57b108ba9202a6f05f11cfdbb806`**, including FS-1.2. GitHub HTTPS clone failed with the configured CA bundle; a schannel retry failed with `SEC_E_NO_CREDENTIALS`. TLS verification was not disabled. A fresh connected GitHub `list_branches` query independently returned this SHA for protected `main`. An isolated `--no-hardlinks` local clone supplied the exact object and was detached at it. Thus current-main identity is verified by API; a successful upstream Git fetch is **not** claimed. Final `git diff --exit-code` and `git status --porcelain=v1` were clean. Build outputs/dependencies are ignored generated files.

| Item                         | Measured value                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Windows                      | 10.0.19045.0, x64                                                                                |
| PowerShell                   | Windows PowerShell 5.1.19041.6456                                                                |
| Git for Windows              | 2.46.2.windows.1                                                                                 |
| Git Bash                     | 5.2.37(1)-release; MINGW64; MSYS 3.4.10-bc1f6498.x86_64                                          |
| Node                         | Native win32 x64 v24.19.0; `C:\nvm4w\nodejs\node.exe`, resolving to the nvm Windows installation |
| npm                          | 12.0.2                                                                                           |
| mise                         | 2026.10.11 windows-x64                                                                           |
| Gemini CLI                   | Existing stable, non-prerelease `@google/gemini-cli` 0.55.1                                      |
| Codex CLI available on host  | Original PATH: 0.163.0; controlled native-tool PATH: 0.147.0                                     |
| Claude smoke-test binary     | Existing native 2.1.280                                                                          |
| Ordinary test filesystem     | C: NTFS, queried with .NET DriveInfo                                                             |
| Report/source filesystem     | D: exFAT, queried with .NET DriveInfo; no exFAT consumer rerun                                   |
| Interactive terminal         | node-pty 1.1.0 Windows ConPTY, xterm-256color, initially 110×32                                  |
| Noninteractive shell streams | Pipes; Bash reports TERM=dumb                                                                    |

Owned root **T**: `C:\Users\38098\AppData\Local\Temp\arch-vs2-a3kph7`. Separate directories: `T\installed`, `T\ps-consumer`, `T\bash-consumer`, `T\baseline`, `T\nested\{ps,bash}`, `T\fixture-native`, `T\tools`, and individual TUI/quote fixtures and isolated TUI homes. Source: `D:\AI\arch-validation\arch-vs2-source`. Diagnostic evidence **E**: `D:\AI\arch-validation\evidence\gemini-vs2`. Exact configuration is retained in `E\config.json`.

Prior reports were available and reviewed: VS-1 in `arch-source/docs/validation/claude-code-vs1.md`, VS-1R in `arch-vs1r-source/docs/validation/claude-code-vs1r.md`, VS-1.1a in `arch-gb-source/docs/validation/claude-code-vs1-git-bash.md`, and `claude-code-vs1-wsl2.md`. Their installation/publication and ownership results informed fixture setup. Historical EPERM, npm-help/cleanup incidents, Git Bash PATH growth/where.exe discrepancies, and Linux onboarding cancellation limitations remain historical findings. They neither prove Gemini support nor disappear because these CLI tests passed. The filesystem mutation campaigns were not rerun.

## 3. Native Gemini installation and executable identity

The existing user installation and authentication state were preserved; personal authentication was not inspected. No Gemini install/update was necessary. Native launchers are under `%APPDATA%\npm` and target `%APPDATA%\npm\node_modules\@google\gemini-cli\bundle\gemini.js`.

PowerShell selects **`gemini.ps1`**. Git Bash selects the extensionless **`gemini`** shell wrapper, which executes Windows Node. `gemini.cmd` is also installed; Arch's Windows resolver selects that standard npm shim and adapts its Node target without launching CMD. Wrapper contents and resolver/adaptor implementation were inspected. WSL Gemini was never used.

Native checks, before consumer routing: `gemini --version` → 0 / `0.55.1`; `gemini --help` → 0 / help on stdout; `gemini --vs2-unknown-option` → 1 / diagnostic and usage on stderr. All completed without login. Native process observations show Windows `node.exe → bundle/gemini.js`, followed by Gemini's own Node relaunch. This relaunch is observed directly too, not an Arch recursion.

Evidence: `inventory-{ps,bash}.json`, `native-{ps,bash}-{version,help,invalid}.json`, `identity-*-native.jsonl`. Only selected harmless environment fields were recorded; no credentials or complete environments were logged.

## 4. Stable Arch installation evidence

Supported build/install commands, in the disposable source checkout:

```powershell
npm.cmd ci --offline --ignore-scripts --no-audit --no-fund
$env:ARCH_WINDOWS_SDK = '10.0.17763.0'
$env:npm_config_offline = 'true'
npm.cmd run install:stable -- --destination "$T\installed"
```

Dependency installation, TypeScript build, Windows publication helper/bootstrap build and stable installation passed. One premature install attempt failed because dependency installation was still running and `tsc` was not yet available; the completed dependency installation followed by the supported command passed. This preparation failure is not hidden or counted as a provider failure. `E\install.log` retains the successful installation output; PowerShell's redirection decorates npm notices as NativeCommandError records although the command exited 0.

Stable entrypoint: **`T\installed\arch.exe`**. It has `.arch-ready`, `installation.json`, installed application/dependency resources and native publication helper. **92/92 manifest hashes matched**, with no bad resources (`installed-integrity.json`). Consumers' launchers/state reference the installed runtime. Gemini is present in the discovery catalogue, and generic `init/configure/route` contracts support its command name; no provider adapter or hardcoded Gemini path was added.

Source independence was tested by temporarily renaming only the owned source checkout, running installed `arch --help` and routed real Gemini version in both consumers, then restoring the checkout in `finally`. All passed. Runtime PATH contained isolated mise, native npm/Node, existing native Claude and standard Windows/Git directories; it contained no source checkout or developer Arch entrypoint. Production Arch was untouched.

## 5. PowerShell direct routing results

**PASS for measured CLI routing and lifecycle.** `arch init gemini`, `status --json`, and repeated `configure gemini` all returned 0. Status reported initialized routing with integrity intact.

An actual interactive PowerShell under ConPTY evaluated `mise activate powershell`, entered the consumer, and let the prompt refresh. `Get-Command gemini` changed from the native `.ps1` to `T\ps-consumer\.arch\bin\gemini.exe`. Routed version returned 0. Leaving restored native `.ps1`; re-entering restored the Arch executable. Repeated ordinary version commands emitted Arch events and returned to a functioning prompt.

Mise warns that chpwd functionality requires PowerShell 7; in 5.1 activation occurs at the prompt. Noninteractive agent tests therefore explicitly called `prompt | Out-Null` after entering, rather than pretending a directory change alone activates the route. `mise exec` version/help/invalid tests are retained as a separate evidence class.

Accepted interactive record: **`pty-ps-first-timing-attempt.json`** (also the original `pty-ps.json`). A later completion-marker driver retry was interrupted and is excluded; no claims depend on that retry. Safe targeted removal and deinitialization are recorded in section 12.

## 6. Git Bash direct routing results

**PASS for measured CLI routing and leave/re-entry.** Separate NTFS consumer, same SHA and installation. Interactive flags included `i`. The shell evaluated:

```bash
eval "$(mise activate bash)"
cd "$consumer"
type -a gemini
command -v gemini
which -a gemini
where.exe gemini
hash
gemini --version
```

Inside, Bash selected `/tmp/arch-vs2-a3kph7/bash-consumer/.arch/bin/gemini` (Git's mapped spelling of the NTFS temporary directory). Actual execution reached installed Arch and Gemini. Outside, `command -v` selected `/c/Users/38098/AppData/Roaming/npm/gemini`, and native version ran. Re-entry restored the route. `hash` and `hash -r` were observed; clearing the hash did not change the correct selected route.

`where.exe` could not find Gemini in these Bash environments despite correct Bash resolution and successful actual execution. This Windows-lookup mismatch is **not** a routing failure. No global PATH fix or MSYS override was applied. Historical interactive mise PATH growth was not independently quantified in this slice and is not claimed resolved.

Accepted synchronized record: `pty-bash.json` and cleaned `pty-bash.txt`. The earlier fixed-delay attempt sent a directory-change command while Gemini still owned terminal input; outside restoration from that attempt is excluded and retained in `pty-bash-first-timing-attempt.json`. The synchronized retry verified completion before dependent input. Its first completion detector missed an already visible marker; later dependent markers were observed. After final shell `exit`, the driver used owned-terminal cleanup because its one-second exit-event wait expired. This is not counted as proof of normal Bash shutdown; each accepted Gemini command had already returned its completion marker.

## 7. MSYS2 argument conversion findings

Deterministic `vs2probe` uses standard npm-style launchers and a Node fixture outside consumers. It prints argument text plus UTF-8 hex, cwd, selected environment and stdin hex; writes Unicode stderr; exits 42. It is explicitly **not Gemini**.

| Argument class                                  | Default Bash observation, native and routed |
| ----------------------------------------------- | ------------------------------------------- |
| `./relative`, `../parent`                       | Preserved                                   |
| `C:\work\project`                               | Preserved                                   |
| `/c/work/project`                               | `C:/work/project`                           |
| Spaces, Unicode, embedded quote, empty argument | Preserved by Bash in both paths             |
| `/help`                                         | `C:/Program Files/Git/help`                 |
| `key:value`                                     | Preserved                                   |
| `/c/one:/d/two`                                 | `C:\one;D:\two`                             |
| `C:\one;D:\two`                                 | Preserved                                   |

With **process-local** `MSYS2_ARG_CONV_EXCL='*'`, POSIX paths, `/help`, and the colon-separated POSIX list remained literal in both paths. No global change was made. Native/routed fixture argv arrays matched in both conversion modes. The selected Windows path-list environment value containing spaces/Unicode was preserved.

The native extensionless npm wrapper starts Windows Node, so MSYS conversion occurs at that native boundary. Routed Bash crosses into mise/the native route before Arch dispatch. Arch then launches Windows Node directly, without a second Bash conversion. The matching converted arrays support this boundary explanation. Real Gemini received corresponding relative/Windows/POSIX paths in its observed `--version --include-directories ...` tests; this does not establish filesystem access or model handling of those paths.

Evidence: `argv-*.json`, matching `.bash/.ps1` scripts, `real-args-*.jsonl`, `real-quotes-*.jsonl`; fixtures and real-provider observations remain separate.

## 8. Native versus routed Gemini CLI parity

**PASS** in both shells for exact stdout/stderr and exit-code equality of version/help/invalid options with `ARCH_TRACE=0`: six comparisons, all fields equal (`parity-checks.json`). Diagnostic runs deliberately enabled `ARCH_TRACE=1`; their additional stderr events are expected instrumentation, not provider output parity.

Actual Gemini observations additionally establish expected cwd, Windows runtime identity, harmless sentinel/path environment propagation, Unicode/space arguments, piped-input version termination, and normal process exit. `--version` does not demonstrate Gemini consuming stdin as a prompt. The separate fixture establishes byte-identical UTF-8 stdin forwarding in both shells, Unicode stderr, and exit 42; it does not prove inference stdin semantics.

**PowerShell arbitrary quoting: PARTIAL / observed parity failure.** A real Gemini diagnostic used:

```powershell
gemini --version --include-directories 'quote"value' --include-directories '' --include-directories 'tail Україна'
```

Both commands returned version 0 without inference, but their actual Gemini argv differed. Native `.ps1 → node.exe` received a collapsed argument containing `quotevalue --include-directories --include-directories tail`; the routed native-executable entry received the same collapse with **two spaces** between the repeated switches. Unicode tail also split. The embedded quote and empty argument were already corrupted at the Arch Node entry, and the arguments Arch received match what it passed to Gemini. Therefore this is a confirmed PowerShell-entry/native-wrapper compatibility limitation, not demonstrated internal Arch forwarding corruption. Bash preserved the embedded quote, empty argument and Unicode tail exactly in the corresponding **real Gemini** runs.

Evidence: `real-quotes-{ps,bash}-{native,routed}.json[l]`, `real-args-*`, `stdin-fixture-*`, and process identity records. A broad unqualified CLI-parity PASS is not justified for PowerShell 5.1.

## 9. Interactive Gemini TUI evidence

**PARTIAL in both shells; complete interactive acceptance NOT TESTED.** Four bounded attempts used real native/routed Gemini under ConPTY. The installed Gemini documentation explicitly supports `GEMINI_CLI_HOME` as an isolated storage root; each attempt had a fresh separate home. Gemini/Google/cloud credential-related variables were removed from these child environments without logging values. No login, OAuth selection, prompt submission, `-p`, or inference was performed. Disposable consumers used `--skip-trust`.

PowerShell native and routed attempts rendered the authentication chooser and “No authentication method selected.” Arrow input and resize from 110×32 to 90×28 were sent, with narrower output captured. This is initialization evidence, not authenticated chat/TUI completion or comprehensive visual QA. Bash native and routed attempts emitted terminal control sequences but did **not** render a usable authentication chooser within the bounded wait; correct Bash TUI rendering/input is not accepted.

Two Ctrl+C inputs did not produce the post-Gemini shell-return marker in any attempt. The owned terminals were then explicitly killed; shell exit was `-1073741510` (`0xC000013A`). Consequently Ctrl+C return to a functional shell **failed this bounded acceptance check in both direct and routed paths**. Normal TUI `/exit` was not tested at an authentication screen. Routed traces showed finalization/cleanup, but console interruption and subsequent terminal teardown prevent a clean signal-parity claim. This cannot be attributed specifically to Arch from these controls.

All ten recorded TUI Node PIDs were absent at the final bounded cleanup check. Evidence: `tui-{ps,bash}-{native,routed}.json`, `tui-identity-*.jsonl`, `all-observed-processes.json`. Windows Terminal, mintty and a separate classic-conhost session were **NOT TESTED**; Git Bash is not treated as a terminal-host identity.

## 10. Codex-initiated routing evidence

**PASS for process delegation, not semantic AI-task delegation.** The current authorized Codex session invoked shell execution to run the retained drivers and commands. No additional Codex session or semantic Gemini task was created. Three routed versions plus help ran in each controlled shell; all returned 0, provider output and Arch trace events to the calling tool.

Separate nested consumers used normal mise activation and ordinary `gemini`, without assigning `.arch/bin` directly to PATH. Representative scripts:

```powershell
(& $mise activate powershell) | Out-String | Invoke-Expression
Set-Location $nestedConsumer
prompt | Out-Null
(Get-Command gemini).Source
gemini --version
exit $LASTEXITCODE
```

```bash
eval "$("$mise" activate bash)"
cd "$nested_consumer"
eval "$("$mise" hook-env -s bash)"  # explicit refresh in this noninteractive child
type -a gemini
command -v gemini
gemini --version
```

Positive process example, PowerShell first nested call: installed `arch.exe` PID **3560** → installed Arch Node CLI PID **10084** → native Gemini Node PID **4460** → Gemini's own relaunch PID **16324**. The observer queried the live parent's executable image with `Get-Process`; Arch Node's parent image was `T\installed\arch.exe`. Actual Gemini argv pointed to the existing native npm package; cwd was `T\nested\ps`, and the sentinel survived. Equivalent Bash parent-image records identify the same installed Arch boundary.

This goes beyond PATH presence: command resolution, actual parent executable, installed CLI argv, real Gemini argv, Arch execution events, returned output/code and observed exits agree. No direct fallback/bypass occurred in the accepted nested calls. Absolute native-path selection was not needed or used. PATH routing cannot enforce mandatory interception against a caller intentionally choosing another executable.

Evidence: `codex-{ps,bash}-version-{1,2,3}.json`, `codex-{ps,bash}-help.json`, exact scripts, `nested-identities-{ps,bash}.jsonl`, and interactive `CODEX_TOOL_*` records.

## 11. Caller shell and environment inheritance

The current Codex tool execution uses Windows PowerShell; controlled Git Bash children explicitly use `%ProgramFiles%\Git\bin\bash.exe`, not System32's WSL Bash. The interactive tests additionally use real `bash --noprofile --norc -i`. A Bash-hosted Codex CLI launch was **NOT TESTED**. The original host resolves nvm's Codex 0.163.0; the controlled native-tool PATH resolves the existing roaming-npm Codex 0.147.0 (`codex-version.json`). Neither CLI was launched as another agent. Installed versions are inventory evidence, not proof of the active session's host-process ancestry. The demonstrated agent path is this authorized Codex session's shell tool → controlled native shell → mise activation → installed Arch → Gemini.

Test-local mise config/cache/data/trust settings and baseline native-tool PATH were prepared once. Routing PATH entries came from mise; there was no per-command hand insertion of `.arch/bin`, hardcoded Gemini executable override, credential transfer or developer checkout dependency. Explicit `mise exec` tests, noninteractive hook refresh, and interactive prompt hooks are identified separately.

Process identity diagnostics used a small `NODE_OPTIONS --require` observer in separately labelled runs. It records pid/ppid, execPath, argv, cwd, two harmless environment values and TTY flags, plus exit events. A second observer queries only the live parent image. Uninstrumented baseline/parity/reliability calls also passed. Gemini's own Node relaunch inherits the environment. WMI/CIM process inventory was denied; no complete OS command-line or environment dump was obtained or required. These observations establish the measured Node/Arch chain, not a global descendant containment audit.

## 12. Multi-provider isolation smoke test

**PASS independently in both consumers.** `configure gemini claude`, repeated configuration and JSON status passed. `mise exec -- gemini --version` returned `0.55.1`; `mise exec -- claude --version` returned `2.1.280 (Claude Code)`, each with its corresponding Arch command trace.

`route remove gemini` left status containing only Claude; routed Claude version still passed. `deinit --yes` then removed owned Gemini/Claude launchers and the owned mise configuration. Foreign `.arch/foreign-vs2.txt` and root `unrelated.txt` remained. The foreign `.arch` directory was not indiscriminately removed. Native Gemini resolved and executed afterward in both shells. Additional nested/quote/TUI consumers were deinitialized after their tests. Failed/diagnostic fixtures were retained.

Evidence: `{ps,bash}-{two-providers,repeat-two,status-two,multi-gemini,multi-claude,remove-gemini,remaining-claude,claude-after-remove,deinit,native-restored}.json` and `{ps,bash}-preserved.json`.

## 13. Bounded reliability results

| Accepted series                                    | PowerShell | Git Bash |
| -------------------------------------------------- | ---------- | -------- |
| Native real Gemini version                         | 5/5 PASS   | 5/5 PASS |
| Explicit Arch/mise real Gemini version             | 5/5 PASS   | 5/5 PASS |
| Dedicated Codex-initiated activated nested version | 3/3 PASS   | 3/3 PASS |
| Dedicated Codex-initiated help                     | 1/1 PASS   | 1/1 PASS |

Each noninteractive command had a 30-second timeout. No accepted provider CLI command timed out or required retry. Extra successful baseline, parity, isolation and interactive CLI calls are not inflated into this minimum-count table. No filesystem stress rerun was undertaken.

Final diagnostics checked **121 recorded Node process observations** across labelled identity runs; none of those PIDs still existed. Normal CLI records include exit events; forced console termination can prevent a Node exit callback and is not reclassified as normal exit. This is a bounded observed-process check, not proof that arbitrary unobserved descendants cannot survive force termination. Initial terminal-driver timing/marker issues and explicit TUI teardown remain separate from CLI reliability.

## 14. Focused test results

Existing tests only; no tests or production code were authored in the repository.

```text
node node_modules/vitest/vitest.mjs run
  tests/unit/discovery.test.ts tests/unit/npm-shim.test.ts
  tests/unit/process.test.ts tests/unit/process-policy.test.ts
  tests/unit/process-failures.test.ts
  tests/integration/process.test.ts tests/integration/lifecycle.test.ts
  => 7 files passed; 111 passed, 2 skipped

node node_modules/vitest/vitest.mjs run
  tests/unit/routing-journal.test.ts tests/acceptance/routing.test.ts
  => 2 files passed; 57 passed
```

Combined: **168 passed, 2 skipped**. The first suite's two skips are platform-inapplicable POSIX cases. `MISE_BIN` selected the isolated mise executable. Coverage includes discovery, npm shim adaptation/runtime selection, process forwarding/termination policy, ownership/lifecycle and mise routing, generated route behavior and provider separation. Existing lifecycle/discovery fixtures mention Gemini; there is **no dedicated real Gemini CLI conformance suite** in this checkout. These fixture/unit passes do not substitute for the actual provider observations above. Full format/lint/mutation/filesystem campaigns were not rerun for validation-only work. Logs: `focused-tests.log`, `launcher-tests.log`.

## 15. Confirmed defects

No Arch-specific executable routing, ownership, provider collision or normal CLI process-lifetime defect was confirmed.

Confirmed compatibility/acceptance findings are retained:

1. **PowerShell 5.1 quote/empty-argument parity gap**, reproduced with real Gemini and the argv fixture. Corruption is observable before Arch forwarding; exact PS native `.ps1` and routed `.exe` results differ. Full arbitrary-argument transparency fails this measured case.
2. **ConPTY unauthenticated cancellation/shell-return acceptance failure**, native and routed, both shells. Explicit terminal teardown was required. Bash also lacked usable login-screen rendering during the bounded attempt. Attribution to Gemini, console input handling, terminal capabilities or driver interaction remains unresolved.
3. **Bash versus Windows `where.exe` lookup mismatch**, while actual command resolution/process routing is correct. This is an observation, not an Arch routing defect.

No fix or architectural workaround was applied. Historical Windows filesystem incidents were not re-labelled as Gemini defects.

## 16. Environment limitations

Git HTTPS transport could not fetch; current SHA was verified by the connected GitHub API and instantiated from cached objects. WMI/CIM and Get-Volume access were denied; .NET DriveInfo and targeted live parent-image queries provided the required narrower facts. PowerShell 7 was not exercised. Terminal coverage is ConPTY only; no claim is made for mintty, Windows Terminal or classic conhost. Personal Gemini settings were deliberately preserved and excluded from isolated TUI attempts.

The fixed-delay interactive driver initially raced provider input, and the later PowerShell marker retry was interrupted; neither expands the accepted evidence. The synchronized Bash record and the earlier successful PowerShell record are identified explicitly. A failed test driver is not silently treated as a passed user scenario.

## 17. Untested capabilities

- Gemini semantic AI-task delegation, headless prompting, paid/model inference and active-inference cancellation: **NOT TESTED**, zero model-call authorization. A semantic test would require explicit authorization for a chosen Gemini model, one bounded prompt/call, and a stated token/cost limit, using existing legitimate authentication.
- Authenticated Gemini TUI/chat, successful normal TUI exit and verified functional-shell return after TUI Ctrl+C: **NOT TESTED / not accepted**; the bounded cancellation failures are described above.
- Separate Codex CLI sessions launched from PowerShell/Git Bash, intentional absolute-path bypass, Windows ARM64, WSL/DrvFs and Gemini-specific exFAT consumers: **NOT TESTED**.
- Network/auth behavior, inference interpretation of path arguments, arbitrary descendant containment and exhaustive signal semantics: **NOT TESTED**. Non-inference version/help success does not prove an AI task completed.

## 18. Recommendations for WSL2 repetition

Repeat this same SHA on a separately owned ext4 workspace with Linux-native Node, Gemini, mise and independently installed Linux Arch. Re-run direct and current-Codex-tool version/help/invalid/ownership and provider-isolation checks, retaining actual Linux executable identities; do not reuse Windows npm wrappers through WSL interoperability as a native baseline. Compare isolated unauthenticated terminal startup/cancellation with these controls before making a cross-platform terminal claim. Keep inference at zero unless separately authorized. Prior Linux Claude results do not prove Linux Gemini behavior, and no full filesystem stress campaign is warranted by this slice.

Concrete Windows follow-up: repeat the real embedded-quote/empty-argument case in PowerShell 7; investigate login-screen rendering and cancellation first with native Gemini in a real user terminal, then the identical Arch route in the same host. Capture terminal input delivery and settlement before changing Arch. No architectural change is justified by the present routing evidence.

**Answer:** Yes, the independently installed Windows Arch demonstrably routes native Gemini from activated PowerShell and Git Bash commands and from the current Codex session's controlled shell execution, while preserving provider isolation and measured ordinary CLI process behavior. **An unqualified guarantee covering arbitrary PowerShell 5.1 quoting and full interactive process semantics is not supported.**
