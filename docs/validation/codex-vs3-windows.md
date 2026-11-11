# VS-3.0 — Windows Codex provider and self-invocation validation

Executed 2026-11-05, Europe/Kiev. Validation workspace: **`D:\AI\arch-validation`**, resolved with `Get-Location`. This report is outside HCC. No product source changes, commits, PRs, active installation replacement, logout, database repair or parent configuration changes were performed.

## 1. Executive summary and final verdict

**CONDITIONAL GO for measured non-inference CLI routing and one-generation process self-invocation in Windows PowerShell 5.1 and Git Bash.** Real Windows Codex 0.163.0 works directly and through a newly built independent Arch installation. Live ancestry and child-spawn/exit observations establish the current parent Codex, actual tool shell, project-local launcher, installed Arch, npm wrapper and distinct native child Codex. Recursion controls fail closed; provider isolation passes.

The qualifications are PowerShell 5.1 arbitrary-argument differences, isolated temporary-home helper warnings, incomplete TUI acceptance and untested shared-parent-home database concurrency. A TUI-driver false positive sent synthetic shell-check text into Codex input; that attempt is excluded. Its isolated state contains no recorded threads or rollout files. No semantic child task is accepted, and no inference test was authorized or deliberately run. The failed driver prevents claiming that every interactive attempt respected the intended no-input boundary; absence of recorded tasks is not a network-level audit.

| Gate | PowerShell | Git Bash | Accepted scope |
| --- | --- | --- | --- |
| A Native baseline | PASS | PASS | Version, help, exec help, invalid flag |
| B PowerShell routing | PASS | — | Genuine interactive mise entry/exit/re-entry |
| C Git Bash routing | — | PASS | Genuine interactive mise, actual Windows provider |
| D CLI parity | PARTIAL | PASS | Eight standard command comparisons equal; PS arbitrary-quote limitation |
| E Interactive TUI | PARTIAL | PARTIAL | Startup/state initialization observed; complete TUI acceptance withheld |
| F Agent process routing | PASS | PASS | Active parent → tool shell → Arch → distinct native child |
| G Recursion safety | PASS | PASS | One normal routing boundary; native-missing control fails closed |
| H Parent state integrity | PASS | PASS | Protected files unchanged; same parent alive; isolated child stores |
| I Provider isolation | PASS | PASS | Codex/Claude/Gemini identities and targeted removal |
| J Evidence integrity | PASS | PASS | Failed drivers excluded; actual provider distinguished from fixtures |

PASS is limited to the stated observation. PARTIAL denotes incomplete coverage or a failed subset; NOT TESTED denotes an unexecuted capability. No confirmed Arch defect requires a BLOCKED verdict. Full arbitrary-argument or authenticated interactive support is not claimed.

## 2. Exact source and environment provenance

The exact Gemini VS-2.0 source was deliberately retained: **`b4c35238614e1df7dc696b05bb286ae6c34b2825`**, tree **`0d6cb93f29ea57b108ba9202a6f05f11cfdbb806`**, including FS-1.2. Both shells used this same SHA. A fresh independent `git clone --no-hardlinks --no-checkout arch-vs2-source <source>` followed by detached checkout supplied it. VS-2 had independently verified this commit as main through GitHub; VS-3 does **not** claim a new upstream fetch/current-main verification. Choosing the exact prior baseline follows the milestone preference and makes the comparison controlled.

Owned NTFS root **T**: `C:\Users\38098\AppData\Local\Temp\arch-vs3-KFcqXW`. Evidence **E**: `T\logs`. Separate owned directories contain `source`, `build`, `installed`, `ps-consumer`, `bash-consumer`, `runtime`, `observations`, `nested`, `child-home`, `child-sqlite` and `tools`. Exact paths/settings are retained in the external `vs3-config.json`; diagnostic drivers are `vs3-*.mjs`, `vs3-*.cjs` and `vs3-process.cs` in the report workspace. Raw execution logs and per-command scripts are in E. No real project or report-workspace consumer was used.

| Item | Observed |
| --- | --- |
| Windows / architecture | 10.0.19045.0 / native x64 |
| PowerShell | Windows PowerShell 5.1.19041.6456, Desktop edition |
| PowerShell 7 | NOT TESTED; `Get-Command pwsh` found no executable on the original PATH |
| Git for Windows | 2.46.2.windows.1 |
| Git Bash / MSYS | 5.2.37(1)-release / 3.4.10-bc1f6498.x86_64, MINGW64 |
| Node / npm | Native win32 x64 v24.19.0 / 12.0.2 |
| mise | 2026.10.11 windows-x64 |
| Parent and tested child Codex | 0.163.0, npm-distributed native Windows binary |
| Other installed providers | Claude 2.1.280; Gemini 0.55.1 |
| Filesystems | T and all consumers: C: NTFS; report directory D: exFAT, measured using .NET DriveInfo |
| Interactive host | node-pty 1.1.0 Windows ConPTY; 130×35 for CLI activation; 110×32 → 90×28 for TUI |
| Noninteractive streams | Pipes; inherited TERM=dumb |
| Restrictions | Workspace/temporary-directory writes; protected parent state; restricted network; sandbox/rule/skill escalation automatically unavailable; no approvals bypassed |

Prior available reports were reviewed: Claude VS-1, VS-1R and Git Bash VS-1.1a in their validation checkouts; `claude-code-vs1-wsl2.md`; and `gemini-vs2-windows.md`. Their publication/ownership evidence, unresolved Windows incidents, Bash lookup/PATH observations and terminal-driver limitations informed this slice. Historical Claude success is not Codex proof. No filesystem stress or mutation campaign was repeated.

## 3. Parent Codex protection measures

Native Toolhelp process enumeration and `QueryFullProcessImageName` identified the active parent **PID 2312**, native `codex.exe` 0.163.0 beneath the existing nvm npm package. Its tool chain contains `codex-command-runner-0.163.0.exe` and Windows PowerShell. Parent ancestry before and after testing is retained in `parent-ancestry*.json`. The parent stayed usable for subsequent tool commands and this report.

`CODEX_HOME` was not overridden in the original tool environment; the observed default parent home is `%USERPROFILE%\.codex`. No `sqlite_home` override was found in the inspected user config or selected environment. Runtime SQLite files exist directly there, and separate application databases also exist under `.codex\sqlite`. Their presence does not prove which handles the running parent currently has open; no parent database was queried or repaired. Default-home interpretation follows the [official state-location documentation](https://learn.chatgpt.com/docs/config-file/config-advanced).

Children received **`CODEX_HOME=T\child-home`** and a newly written minimal config with **`sqlite_home=T\child-sqlite`**. TUI fixtures each received different home/database directories. No parent home, authentication tokens or configuration tree was copied. API-key and parent thread/session identity variables were removed from child environments without logging their values. Only selected harmless environment fields and presence/absence were recorded.

Read-only SHA-256 comparisons of parent `config.toml`, `auth.json` and `hooks.json` showed all three byte-unchanged after testing (`parent-protected-before/after.json`). Hashes themselves need not be published. Active database files naturally change as the parent works; a before/after database hash would not establish corruption and was not used. PASS here means bounded protection evidence, not a forensic audit of every parent database page.

## 4. Native Codex executable identity

The consistent native selection is the existing nvm **`@openai/codex` 0.163.0** installation. Observed variants:

- `C:\nvm4w\nodejs\codex`, `codex.cmd`, and `codex.ps1`.
- Native `codex.exe` within `node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin`.

There is no claim that `codex.exe` exists next to the npm shims. A separate roaming-npm installation also exists; it was not selected for the accepted tests. Unlike VS-2's controlled PATH, VS-3 places the nvm prefix before roaming npm, preventing a silent version switch.

PowerShell selects `codex.ps1`; Bash selects the extensionless shell wrapper. Those launch Windows Node and `@openai/codex/bin/codex.js`, which spawns the real native executable. Arch selects/adapts the standard npm `.cmd` shim, starts the same JS wrapper without CMD, and the wrapper starts that same native binary. The wrapper's own package-manager environment annotations are native behavior, not an Arch provider substitution.

Before routing, both shells returned: version **0**, help **0**, `exec --help` **0**, deliberately invalid `--vs3-unknown-option` **2**. Version was `codex-cli 0.163.0`. Standard commands did not alter the isolated child config or create SQLite files (`baseline-state-before/after.json`). They emitted a native warning refusing helper/PATH-alias creation under a temporary CODEX_HOME, yet exited normally. The same warning occurs directly and routed.

## 5. Independent Arch installation

Supported workflow in the fresh checkout:

```powershell
npm.cmd ci --offline --ignore-scripts --no-audit --no-fund
$env:ARCH_WINDOWS_SDK = '10.0.17763.0'
$env:npm_config_offline = 'true'
npm.cmd run install:stable -- --destination "$T\installed"
```

Build and install exited 0. Stable entrypoint: **`T\installed\arch.exe`**. Readiness, manifest, dependency closure and publication/bootstrap resources were installed. **92/92 resource hashes matched** before and after validation. Supported builds generate ignored outputs in the checkout; native build artifacts were additionally retained separately under `T\build`. Source text remained unchanged.

Codex is already in Arch's discovery catalogue and generic route contracts. No implementation, provider adapter or hardcoded native target was added. Repeated `init/configure codex` and JSON status passed in both consumers. Generated launchers reference the installed runtime, not the source CLI.

Installed help plus routed Codex version in both consumers passed while the owned source checkout was temporarily renamed unavailable, then restored in `finally`. Runtime PATH contained no source checkout, developer Arch entrypoint or npm-linked Arch prerequisite. Evidence: `npm-ci.log`, `install.log`, `installed-integrity.json`, `independent-*.json`.

## 6. PowerShell terminal routing

**PASS for measured CLI routing.** A real interactive PowerShell/ConPTY shell evaluated `mise activate powershell`. After consumer entry and an actual prompt refresh, resolution changed from native `codex.ps1` to **`T\ps-consumer\.arch\bin\codex.exe`**. Ordinary version and exec-help commands reached installed Arch and the genuine native provider. Leaving restored native resolution; re-entry restored routing. All nine completion markers were observed and the shell exited normally (`pty-ps.json`, `pty-ps.txt`).

Mise warns that chpwd functionality needs PowerShell 7. PowerShell 5.1 prompt activation was observed; noninteractive tests explicitly invoked `prompt | Out-Null` after changing directory. They do not pretend that `Set-Location` alone refreshes activation. Explicit `mise exec` parity tests are separate evidence. Repeated configuration, safe removal and deinitialization passed (section 14).

PowerShell's original PSReadLine history write was denied by the sandbox; no history-file change is claimed. Corrected TUI children removed PSReadLine only within their own shell process. No profile or global shell configuration was changed.

## 7. Git Bash terminal routing

**PASS for measured CLI routing.** Actual executable: `%ProgramFiles%\Git\bin\bash.exe`, interactive `--noprofile --norc -i`; this is not System32's WSL launcher. The shell ran `eval "$(mise activate bash)"`, then project entry, `type -a`, `command -v`, `which -a`, `where.exe`, `hash`, version, leave/re-entry, `hash -r`, and exec help.

Bash selected `/tmp/arch-vs3-KFcqXW/bash-consumer/.arch/bin/codex` inside; outside it selected `/c/nvm4w/nodejs/codex`; re-entry restored the Arch launcher. Git's `/tmp` spelling maps to the actual owned NTFS directory. All nine synchronized completion markers were observed and the shell exited normally. Actual Windows child process identity and Arch events corroborate lookup results.

Windows `where.exe` observations are retained separately from Bash's selected command. A differing search result is not treated as failure when actual process routing is correct. No global MSYS setting or PATH deduplication workaround was applied. Historical mise PATH growth is not claimed resolved or freshly quantified. Evidence: `pty-bash.json/.txt`, `inventory-bash.json`.

## 8. Native versus routed CLI parity

**Eight standard comparisons PASS:** each shell's version, help, exec-help and invalid flag had exactly equal stdout, stderr and exit code with `ARCH_TRACE=0` (`parity.json`). Diagnostic runs intentionally enable Arch traces; their additional stderr is not a provider-output regression. Version/help/exec-help exit 0, invalid flag exit 2. None of the accepted noninteractive commands timed out.

Observed wrapper/native spawn boundaries preserve the expected consumer cwd and isolated CODEX_HOME. The observer records the sentinel, Unicode path-list value and stripped parent-thread identity at the wrapper boundary. Actual OS child creation uses the intended native executable and inherited environment. This supports forwarding; it is not a complete inspection of the Rust process's internal configuration object. No unintended Arch-supplied Codex config flag appeared in the observed argv.

**PowerShell arbitrary quoting is PARTIAL.** Real Codex was invoked harmlessly with `--version -C 'C:\Space path\Україна' --add-dir '/c/work/project' --add-dir 'quote"value' --add-dir '' --add-dir 'tail Україна'`. Both paths exited 0. Their native-executable spawn argv nevertheless differ: native forwarding collapses the unmatched embedded quote into `quotevalue --add-dir --add-dir tail`, while routed forwarding has two spaces between repeated switches; the Unicode tail also splits. Corruption is already visible in the arguments received by Arch. Its received arguments match its forwarded arguments. This reproduces the VS-2 PowerShell 5.1/native-wrapper boundary limitation; it is not demonstrated internal Arch corruption.

Bash preserved the embedded quote, empty argument and Unicode tail identically in the **real Codex native spawn** records. `--version` does not prove those paths were accessed or interpreted by a model. Fixture stdin forwarding was also byte-identical, with Unicode stderr and exit 42; that does not establish model-prompt stdin behavior.

## 9. MSYS2 argument-conversion observations

Separate deterministic `vs3probe` npm-style fixtures print argument text/UTF-8 hex, cwd, selected environment and stdin hex. They are not substituted for Codex.

| Input | Default native and routed Bash fixture result |
| --- | --- |
| Relative paths, Windows drive path | Preserved |
| `/c/work/project` | `C:/work/project` |
| Spaces, Unicode, embedded quote, empty argument | Preserved |
| `/help` | `C:/Program Files/Git/help` |
| `key:value` | Preserved |
| `/c/one:/d/two` | `C:\one;D:\two` |
| Windows path list | Preserved |

Native/routed fixture argv arrays match under default conversion and process-local `MSYS2_ARG_CONV_EXCL='*'`. With exclusion, POSIX strings and `/help` remain literal. The path-valued environment sentinel survives. Default actual Codex spawn records likewise show `/c/work/project` converted and Windows paths preserved.

Conversion occurs where Bash/MSYS crosses into Windows execution: native npm wrapper → Node, or mise/native route before Arch dispatch. Arch forwards the argv it actually receives to Windows Node without another Bash layer. No global exclusion setting was changed. Evidence: `argv-*`, `real-args-*.jsonl`, `stdin-*`; PowerShell quote failures are reported separately.

## 10. Interactive Codex TUI

**PARTIAL; normal interactive exit, reliable Ctrl+C and functional-shell return are not accepted.** Direct and routed TUI attempts used separate homes and explicitly configured SQLite directories, without copying authentication or entering a legitimate task. ConPTY resizing/arrows and terminal output were recorded. Initial TERM=dumb attempts stopped at Codex's warning; those are environment/driver observations, not TUI success.

Terminal-corrected attempts set TERM=xterm-256color, disabled child shell history and supplied a standard cursor-query response where requested. They displayed the real `OpenAI Codex (v0.163.0)` loading/input surface and created isolated runtime databases and daemon/package resources. Correct rendering and input semantics were not comprehensively verified by a terminal emulator.

**Excluded driver error:** redrawn historical shell text falsely satisfied a shell-return heuristic. The driver then sent a synthetic shell-check string while Codex was still active. Its `returned:true` field is invalid evidence. Actual shell-alive markers were absent. Read-only metadata audits of those four isolated `state_5.sqlite` databases found **zero threads**; no rollout files or copied auth file were present. This does not establish semantic delegation or provide a network-level no-inference guarantee. No legitimate prompt/inference test is accepted from it.

A final process-gated attempt sent only arrows, resize and Ctrl+C until recorded wrapper/native exits permitted any shell check. It established a concrete native startup error: **`path must be shorter than SUN_LEN`** for the isolated home's `app-server-control/app-server-control.sock`. The native diagnostic itself recommends `--no-daemon`. PowerShell direct/routed and Bash direct then produced a genuine shell-alive marker and shell exit 0; this is recovery after failed startup, not successful TUI cancellation. Routed Bash did not settle before teardown and emitted a Windows interruption exit during cleanup. These differing outcomes do not establish an Arch-specific signal defect because startup/daemon timing was not controlled further.

Results remain in `tui-*-process-gated.json[l]`. All TUI variants, including failures, are retained. Owned-terminal teardown can force cancellation, so it must not be counted as normal Codex exit. node-pty teardown also emitted `AttachConsole failed`; this is a harness limitation, not demonstrated Arch failure. Separate mintty, Windows Terminal and classic conhost sessions were NOT TESTED.

## 11. Codex-initiated self-invocation proof

**PASS for deterministic process delegation in each shell.** The active parent used its normal shell tool to run retained commands/drivers. Separate nested consumers used genuine mise activation, then ordinary `codex --version` three times, `codex --help`, and `codex exec --help`. All returned 0 with provider output and Arch events. No extra reasoning/inference agent was spawned.

Representative PowerShell ancestry, captured live:

```text
Parent native Codex PID 2312
  → codex-command-runner → outer Windows PowerShell → diagnostic driver
  → controlled PowerShell PID 4680
  → consumer .arch/bin/codex.exe PID 16104
  → installed arch.exe PID 3040
  → installed Arch Node CLI PID 13836
  → native npm Codex wrapper Node PID 15948
  → genuine native Codex PID 17716 (--version)
```

This distinguishes the Arch launcher named `codex.exe` from the genuine npm-distributed native `codex.exe` by full image path and ancestry. Bash has equivalent records through its actual controlled Bash child. `spawn`/`spawned` and `child-exit` observations identify a distinct OS child and its normal code 0; Arch traces identify one execution and completion. The live parent remains PID 2312. Evidence: `nested-{ps,bash}.jsonl`, `agent-{ps,bash}-{version-1,version-2,version-3,help,exec-help}.json` and exact scripts.

## 12. Parent/child environment and state isolation

Parent: original validation cwd, active user home and thread identity. Child: disposable consumer cwd, controlled native-tool PATH, project mise route, isolated CODEX_HOME and explicit isolated SQLite location. Parent session/thread variables were not copied into diagnostics. The parent tool shell is PowerShell; Git Bash is an explicitly selected controlled child. A separate Bash-hosted parent Codex session was NOT TESTED.

Official configuration supports both [CODEX_HOME isolation](https://learn.chatgpt.com/docs/config-file/config-advanced) and [sqlite_home placement](https://learn.chatgpt.com/docs/config-file/config-reference). Standard CLI commands left the isolated home containing only its minimal config and created no SQLite files. Two concurrent version commands sharing that disposable child home passed; this proves concurrent CLI startup, not SQLite transaction concurrency.

Real TUI startup, directly and routed, created state/logs/goals/memories/queue SQLite files and WAL/SHM files in the intended per-fixture SQLite directory. It also materialized native app-server daemon/package resources under its isolated home. That provider-internal startup is not Arch launcher recursion. State locations and file metadata were inspected without exposing database contents. A final **read-only `PRAGMA quick_check` passed on all 40 disposable SQLite databases across eight fixtures**, and all eight state databases contained zero threads (`final-child-sqlite-audit.json`). No parent database was queried. No SQLite errors or parent-state collisions were established by the accepted CLI runs; the TUI socket-path startup error is separate from SQLite integrity.

Children deliberately sharing the active parent's home, authenticated concurrent turns, database locks/recovery and parent database internals are **NOT TESTED**. Isolation is the documented tested configuration, not a claimed fix for an observed shared-home defect. No parent database was locked, corrupted, copied or repaired.

## 13. Router recursion and bypass analysis

**Recursion safety PASS in the bounded scenarios.** Normal observed calls contain one project launcher and one installed Arch boundary before the actual native Codex. The npm wrapper/native pair and Codex's own TUI daemon are legitimate provider processes; neither is an `Arch → Arch` loop. Maximum intentional agent-generation depth was one.

A separate control exposed only the consumer's `.arch/bin`, isolated mise and Windows System32 on PATH. `ARCH_NODE` explicitly selected the existing runtime solely so Arch could start without the native provider's npm-prefix directory. Installed `arch run codex -- --version` returned **1** in both consumers with **`Native executable not found: codex`**, execution-failed/resolution and cleanup events, within the ten-second limit. It did not repeatedly resolve its own launcher. This diagnostic PATH is not counted as genuine activation evidence.

Absolute native `codex.exe --version` from an otherwise activated consumer succeeded without Arch events in both shells: **observed bypass**, not an Arch defect. The test explicitly chose the native executable only for this diagnostic. PATH routing is not mandatory interception. Ordinary PATH routing, explicit bypass and missing activation/native-resolution failure are distinct classifications.

## 14. Provider isolation results

**PASS independently in both consumers.** Existing providers only: `configure codex claude gemini`, repeated configuration and status passed. Routed versions identified Codex **0.163.0**, Claude **2.1.280**, Gemini **0.55.1**, with the correct Arch command events.

Removing only Codex left Claude/Gemini in status; both still executed successfully. Deinitialization removed owned provider launchers and the owned mise configuration, preserving `.arch/foreign-vs3.txt` and root `unrelated.txt`. Native Codex resolved and ran afterward. Nested, argument and TUI route fixtures were deinitialized separately. No other-provider inference was run. Evidence: `{ps,bash}-three-providers`, `*-multi-*`, `*-remaining-providers`, `*-after-remove-*`, `*-deinit`, `*-preserved.json`.

## 15. Bounded reliability results

| Accepted series | PowerShell | Git Bash |
| --- | --- | --- |
| Native version | 5/5 PASS | 5/5 PASS |
| Explicit mise/Arch version | 5/5 PASS | 5/5 PASS |
| Parent-initiated activated child version | 3/3 PASS | 3/3 PASS |
| Parent-initiated help and exec help | 2/2 PASS | 2/2 PASS |

Each ordinary command had a 30-second timeout; recursion controls had ten seconds. No accepted provider CLI command timed out or needed retry. Failed TUI/driver attempts are not counted in this CLI table. Individual `repeat-*` and `agent-*` logs retain actual command, shell, cwd, status and streams.

The final cleanup audit checked **128 recorded wrapper/native process observations; none of those PIDs remained**. A separate image-path snapshot found no running test-root executable apart from the snapshot helper itself. One intermediate PID-existence sample overlapped later tool activity and disappeared on the next observation; it was not used as grounds to terminate a process. Parent PID 2312 is outside the ownership set and was never a termination target. PID-existence checks are bounded evidence, not a universal descendant-containment guarantee. Failed fixtures and state remain for review.

## 16. Focused repository test results

**PASS: 9 files, 168 tests; 2 platform-specific skips.** Executed existing discovery, npm-shim, process, process-policy, process-failures, routing-journal, integration process/lifecycle, and acceptance routing tests with isolated `MISE_BIN`. The Windows Ctrl+C/Ctrl+Break fixture tests are included; the two skips are POSIX graceful-termination and POSIX SIGINT/SIGTERM cases.

```text
node node_modules/vitest/vitest.mjs run
 tests/unit/discovery.test.ts tests/unit/npm-shim.test.ts
 tests/unit/process.test.ts tests/unit/process-policy.test.ts
 tests/unit/process-failures.test.ts tests/unit/routing-journal.test.ts
 tests/integration/process.test.ts tests/integration/lifecycle.test.ts
 tests/acceptance/routing.test.ts
```

These cover provider discovery/generic command names, Windows shim adaptation, routing/ownership, argument/process forwarding, recursion avoidance, mise integration and lifecycle. There is no dedicated real-Codex conformance suite in the executed set; actual provider evidence above supplies that separate class. No tests were authored or source edited. Full lint/format/mutation/filesystem campaigns were not rerun for this validation-only task. Log: `focused-tests.log`.

## 17. Confirmed product defects

No Arch-specific routing loop, provider collision, ownership violation, active-parent corruption or ordinary CLI process-lifetime defect was confirmed.

Confirmed compatibility limitations: PowerShell 5.1 embedded-quote/empty-argument native-versus-routed difference; native Codex's helper-alias refusal for temporary homes; and native daemon startup failure when its isolated socket path exceeds SUN_LEN. These have direct native controls. TUI teardown/driver failures do not establish an Arch-specific defect. Historical Windows EPERM or cleanup incidents remain historical, not newly confirmed Codex defects.

## 18. Test-harness and environment limitations

The TUI shell-return heuristic was incorrect and its success fields are explicitly rejected. Synthetic shell text was sent into active TUI input; no recorded thread/task resulted, but that attempt cannot support the intended no-input guarantee. Final process-gated runs avoid that heuristic. No broader TUI claim is made from screen redraws, cursor responses or forced cleanup.

ConPTY is the only interactive host tested. Initial TERM=dumb and denied PSReadLine history access are environment limitations; corrected child settings do not modify parent profiles. `AttachConsole failed` occurred in node-pty cleanup. Selected environment filtering and NODE_OPTIONS observers apply only to labelled diagnostics; baseline/parity/reliability calls also pass without instrumentation. Toolhelp reads image paths, while Node spawn observations record native command/PID/exit; this is not an OS-wide syscall audit.

The sandbox restricts writes/network and disallows escalation categories. Git ignore-file reads warn of denied access; source status/diff remain clean. No security settings were weakened. TUI internal package materialization occurred only under disposable homes; the installed active parent executable was not updated or replaced.

## 19. Explicit untested capabilities

**Semantic child-agent delegation: NOT TESTED — requires explicit permission for a bounded child-agent inference call.** Version/help do not prove task completion. A minimal future procedure is one parent and one child generation, a synthetic prompt such as “Return only VS3_OK”, an empty disposable project/home with supported authorized authentication, a fixed 60-second timeout and explicitly agreed one-call token/cost budget. Capture the same Arch/native process evidence, distinct child session identity, answer/exit and cleanup; do not give the child real project secrets or reuse the parent thread.

Also NOT TESTED: active-parent-home SQLite concurrency; authenticated child turns and termination recovery; PowerShell 7; native Codex installed by a different installer; Windows ARM64; separate Bash-hosted parent CLI; mintty/Windows Terminal/classic conhost; WSL/DrvFs; mandatory interception against absolute paths. Normal full TUI `/exit` and authenticated interaction remain unaccepted. No deliberate inference or authentication test is authorized by this report.

## 20. Recommendations for the Ubuntu WSL2 repetition

Repeat the same HCC SHA with Linux-native Codex/Node/mise, a separate installed Linux Arch and owned ext4 consumers/homes/database directories. Prove actual Linux executable ancestry for terminal and current-parent-tool calls; do not count Windows npm interoperability as native Linux support. Repeat CLI/state metadata, recursion and absolute-path controls, plus the focused three-provider smoke only where providers already exist.

Before extending TUI claims, use a real terminal emulator and gate shell-check input on actual child/process completion. Re-test native first, then the identical Arch route. On Windows, the smallest separate follow-up is a short owned CODEX_HOME/socket path, or the native diagnostic's supported `--no-daemon` option, followed by a clean TUI cancellation/normal-exit check. Repeat the real quoting case in PowerShell 7 separately. Shared-home database testing and one-call semantic delegation need a separately scoped, explicitly authorized test. No evidence justifies an Arch architecture change or another filesystem stress campaign.

**Answer:** Windows Arch reliably routed genuine Codex 0.163.0 from measured PowerShell, Git Bash and the running parent Codex's shell tool, with no observed router recursion, protected-parent-file corruption or provider interference. That answer is conditional on the tested isolated-state CLI configuration; arbitrary PowerShell 5.1 quoting, full TUI semantics and shared-parent-home concurrency are not established.
