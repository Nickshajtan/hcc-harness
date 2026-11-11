# VS-3.1 — Real Codex-to-Codex delegation, Windows

Executed 2026-11-05, Europe/Kiev. Report workspace: **`D:\AI\arch-validation`**. Continuation of VS-3.0; no HCC changes, rebuilds, reinstalls, commits, parent configuration changes or credential copies.

## 1. Final verdict

**Sandbox prerequisite BLOCKED — the available Windows sandbox backend cannot enforce the required restricted read-only child boundary, and invocation-local MXC tests confirm native MXC is unavailable on this executor. Semantic delegation is NOT TESTED in both shells.**

The MXC continuation is recorded in section 14. It preserves the original evidence below, adds direct/routed permitted-file and synthetic-canary controls, and leaves the inference count at **0 of 2**. No administration, provisioning, policy weakening or source change was performed.

Both routed preflights reached genuine native Codex and exited 1 before executing the fixture-read command:

```text
windows sandbox failed: Restricted read-only access requires the elevated Windows sandbox backend
```

Direct native controls produced the identical error. This is a native sandbox/backend prerequisite failure, **not an Arch routing failure**. The experiment did not broaden read access, disable sandboxing, provision an elevated backend, or spend an inference attempt to see whether a model could work around it. This follows the instruction to stop if the intended execution boundary cannot be enforced safely.

**Real child inference invocations: 0 of the maximum 2.** No child-agent result or tool-read event is claimed. CLI process routing remains distinct from semantic delegation.

| Requirement                                         | PowerShell           | Git Bash             |
| --------------------------------------------------- | -------------------- | -------------------- |
| Existing Arch interception and native child process | PASS, preflight only | PASS, preflight only |
| Restricted read-only execution preflight            | BLOCKED              | BLOCKED              |
| Actual child model inference                        | NOT TESTED           | NOT TESTED           |
| Child independently reads fixture                   | NOT TESTED           | NOT TESTED           |
| Verified child answer                               | NOT TESTED           | NOT TESTED           |
| Parent protected files / bounded cleanup            | PASS                 | PASS                 |

## 2. Exact environment and HCC SHA

Read and reused `codex-vs3-windows.md` and its existing infrastructure. Both shells used HCC **`b4c35238614e1df7dc696b05bb286ae6c34b2825`**, unchanged from VS-3.0 and Gemini VS-2.0. Final source diff was empty. No upstream-version substitution was made.

Reused NTFS root **T**: `C:\Users\38098\AppData\Local\Temp\arch-vs3-KFcqXW`.

- Independent stable Arch: `T\installed\arch.exe`.
- Existing PowerShell/Git Bash consumers: `T\ps-consumer`, `T\bash-consumer`.
- Independent fixtures: each consumer's `vs31-task\entries.txt`.
- New isolated homes/databases: `T\vs31\{ps,bash}-home` and `{ps,bash}-sqlite`.
- Raw diagnostics, exact scripts, prompts and metadata: **`T\vs31\logs`** (E).

Windows 10.0.19045.0 x64; Windows PowerShell 5.1.19041.6456 Desktop; Git for Windows 2.46.2.windows.1; Bash 5.2.37/MSYS 3.4.10; native Windows Node 24.19.0; npm 12.0.2; mise 2026.10.11; Codex CLI **0.163.0**. Execution used pipes, not TUI/ConPTY. The parent tool shell is PowerShell; the Bash branch explicitly launches Git for Windows Bash.

## 3. Parent and child runtime identities

The active parent remains native **Codex PID 2312**, under the existing nvm `@openai/codex` installation. Its normal shell-tool path includes `codex-command-runner-0.163.0.exe` and Windows PowerShell. No new parent agent session was created.

Preflight child native Codex PIDs were **3708** (PowerShell) and **1740** (Bash), distinct from the parent. Native image:

```text
...\@openai\codex\node_modules\@openai\codex-win32-x64\
vendor\x86_64-pc-windows-msvc\bin\codex.exe
```

These were diagnostic CLI children, **not independently reasoning agent sessions**. Their process creation does not satisfy semantic delegation.

## 4. PowerShell semantic delegation evidence

The existing consumer had been deinitialized at the end of VS-3.0. Its Codex route was restored using the same installed Arch. The preflight evaluated `mise activate powershell`, entered the fixture directory, called `prompt | Out-Null` for PowerShell 5.1 activation, and inspected `Get-Command codex`. Resolution selected the consumer's `.arch\bin\codex.exe`.

The parent then invoked this non-inference sandbox probe through ordinary `codex`:

```text
codex --sandbox read-only sandbox -P task -C <fixture> --
  <Windows PowerShell> -NoProfile -Command
  "Get-Content -LiteralPath 'entries.txt'"
```

The command failed before the read: **exit 1, 1,710 ms, no timeout**. Arch emitted execution-started, finalization/cleanup and execution-completed with code 1. A direct native control using the same arguments/home failed identically in **87 ms**. No `codex exec <task>` was launched.

Evidence: `ps-routed-sandbox-probe.json`, `ps-native-sandbox-control.json`, `ps.ps1`, `ps-process.jsonl`.

## 5. Git Bash semantic delegation evidence

The separate existing Bash consumer's route was restored. Actual outer execution used `%ProgramFiles%\Git\bin\bash.exe --noprofile --norc`; live ancestry shows Git's `usr\bin\bash.exe`. It evaluated mise activation plus an explicit noninteractive `mise hook-env -s bash` refresh after entering the fixture. `type -a` and `command -v codex` selected `/tmp/arch-vs3-KFcqXW/bash-consumer/.arch/bin/codex`.

The same sandbox probe, quoted as Bash arguments, failed **exit 1, 5,610 ms, no timeout**. The direct native control failed identically in **82 ms**. The planned inner read utility was Windows PowerShell in both probes; that does **not** turn the outer Bash invocation into a PowerShell branch. The child agent's own future tool shell is unobserved because no agent run occurred.

Actual native spawn argv retained the intended Windows fixture path and read command. No real child prompt was submitted, so prompt delivery/model interpretation under MSYS2 is **NOT TESTED**. Evidence: `bash-routed-sandbox-probe.json`, `bash-native-sandbox-control.json`, `bash.bash`, `bash-process.jsonl`.

## 6. Actual child tool execution proof

**NOT TESTED.** The deterministic probe is a native sandbox diagnostic, not a model-chosen tool call. It produced no fixture contents and failed before starting the read utility. There is no child JSON `command_execution`/tool-read event, startup thread event or model response to score. Prior VS-3.0 help/version results are not reused as semantic proof.

The safety profile denied root reads, allowed the minimal runtime and fixture workspace reads, allowed the isolated child home, and disabled tool networking. It was selected explicitly with `sandbox -P task`. The profile avoids treating generic read-only access to the whole machine as sufficient for this fixture-only requirement. Native Codex rejected this restricted-read configuration with the elevated-backend prerequisite above.

An earlier exploratory `codex sandbox windows --help` also returned `CreateRestrictedToken failed: 87`. Inspection of the installed help showed that this Windows version uses `codex sandbox [COMMAND]`, rather than a `windows` subcommand. That exploratory invocation is **not** counted as the decisive boundary test; the corrected commands and direct controls above are the accepted evidence.

## 7. Verified child output

**No child answer exists.** The parent prepared two short tasks whose prompts do not contain file contents. Each asks the child to read `entries.txt` with its own shell tool, sort names, sum values, return JSON with a marker/file confirmation, and report the tool-observed `CODEX_THREAD_ID`. Prompts explicitly prohibit grandchildren, file changes, secrets inspection and tool networking.

Independent parent parsing of the files established these reference results:

| Fixture    | Sorted names              | Sum | Non-secret marker    |
| ---------- | ------------------------- | --- | -------------------- |
| PowerShell | alpha, beta, delta, gamma | 38  | `VS31_PS_ed643705`   |
| Bash       | alpha, beta, delta, gamma | 33  | `VS31_BASH_f460c853` |

These are **reference answers, not child results**. Fixture hashes/expected values are in `fixtures.json`; the independent file-parsing check is in `final-audit.json`. No successful-answer comparison was fabricated.

## 8. Arch interception and process ancestry

Live PowerShell preflight chain:

```text
Parent Codex 2312 → command runner → parent tool PowerShell → driver
 → controlled PowerShell 18220
 → consumer Arch codex.exe launcher 3088
 → installed arch.exe 18020 → installed Arch Node 13384
 → npm Codex wrapper Node 10384 → genuine native Codex 3708
```

Bash preflight chain:

```text
Parent Codex 2312 → command runner → tool PowerShell → driver
 → Git Bash 7588 / 18392 / 15680
 → consumer Arch codex.exe launcher 8484
 → installed arch.exe 7200 → installed Arch Node 6752
 → npm Codex wrapper Node 8156 → genuine native Codex 1740
```

Full image paths distinguish the Arch launcher named `codex.exe` from the genuine native provider. NODE_OPTIONS instrumentation records actual Node identities, child spawn/exit and selected harmless fields; the reused native Toolhelp helper records ancestry. Arch trace and final code agree with these observations. This proves interception of the **preflight**, not interception of an inference run. No recursive Arch chain was observed.

## 9. Child session identity and state observations

The preflight deliberately preserved inherited `CODEX_THREAD_ID`, unlike VS-3.0's filtered diagnostic environment. It was present at both Arch and native-wrapper Node boundaries. Its value was not published.

No child agent emitted a JSON session/thread identifier, and no child tool ran. Therefore comparison of inherited parent identity versus actual child session identity is **NOT TESTED**. Merely inheriting the parent's variable at CLI startup neither proves the historical child-tool issue persists nor proves a session collision. No attribution to Arch is justified.

Separate homes contained their new minimal configs and small `.sandbox` diagnostic logs; the planned SQLite directories remained empty. Thus agent SQLite initialization/health and authenticated concurrency are **NOT TESTED**, rather than passed based on absence of errors. No parent database was opened, copied or repaired. Parent config/auth/hooks SHA-256 comparisons before/after remained unchanged (`summary.json`); the parent stayed responsive for cleanup and reporting.

## 10. Cost and usage

**Zero child inference runs and zero observed child model usage.** The two-run authorization was not consumed. There is no child token count, provider billing receipt or model response to report.

The configured top-level model was `gpt-6.1-sol` with low reasoning; no account-level model setting was changed. Its API access was not tested. A credential was present in the parent environment. Official documentation supports invocation-scoped [`CODEX_API_KEY` for noninteractive execution](https://learn.chatgpt.com/docs/non-interactive-mode); no credential file copy was needed in the planned design. **All preflight/control environments removed API credentials**, and no authentication attempt was made. Credential availability does not establish that a model request would succeed.

## 11. Timeouts, cleanup and failures

Preflights had a 15-second ceiling and all completed normally with diagnostic exit 1; no timeout or forced kill was needed. Any future authorized inference run remains limited to one invocation per shell with an approximately 120-second ceiling, no retries and no grandchildren. No native inference control was run.

Failure classification:

- **Native sandbox/backend capability: confirmed blocker**, same direct and routed failure.
- Arch routing, shell selection and intended cwd for preflight: PASS.
- Authentication, model response, child agent tool execution and semantic session identity: NOT TESTED.
- Timeout, process leak, recursive routing or parent-state corruption: not observed.

All eight recorded Node/native process observations were absent at final cleanup. Restored routes were deinitialized, preserving the pre-existing foreign resources from VS-3.0. Fixtures, prompts and failed diagnostics remain owned and disposable. HCC source was unchanged. No elevated sandbox provisioning, installation, approval bypass or policy weakening was attempted. There was no automatic-approval rejection to reinterpret as an application failure.

## 12. Remaining limitations

This report does not establish semantic delegation in either shell. It records a safely stopped, reproducible prerequisite failure. The installed CLI explicitly requires an elevated Windows sandbox backend for the chosen restricted-read profile; providing that backend is outside this validation's automatic changes. Generic `--sandbox read-only` alone must not be silently substituted if it broadens reads beyond the intended fixture/runtime boundary. Current [official permission-profile documentation](https://learn.chatgpt.com/docs/config-file/config-reference) distinguishes explicit read/deny rules; actual enforcement remains the required acceptance test.

The initial Windows prerequisite was an already configured supported backend capable of restricted reads. The MXC continuation below now establishes that the available invocation-local alternative cannot start either. Stop this Windows path and repeat the semantic test under Ubuntu WSL2; do not automatically install or provision the elevated backend. Any future Windows repetition must first pass both permitted-file access and enforced synthetic-canary denial, without broadening the policy.

## 13. Recommendation for the equivalent WSL2 test

Use the same HCC SHA with independently installed Linux Arch/native Codex on owned ext4. Recreate the two synthetic fixtures and isolated homes/databases. First prove the supported Linux sandbox can read the fixture while enforcing the intended read restrictions; a Windows backend failure does not predict Linux results. Then, within an explicitly bounded inference authorization, run one tool-using semantic task, capture JSON tool/session events, verify the answer from the actual file, compare inherited thread identity with the emitted child session, and check cleanup. No extra provider or filesystem stress campaign is indicated.

**Answer:** Not established in this Windows execution environment. Arch correctly routes the diagnostic Codex children, but the required restricted-read sandbox cannot start, so a real tool-using child task was not launched. Removing that backend prerequisite is necessary before safely demonstrating semantic delegation.

## 14. MXC investigation and restricted-read canary continuation

Executed later on 2026-11-05 using the same Codex **0.163.0**, Windows **10.0.19045.0**, HCC SHA, installed Arch, consumers, fixture contents, markers and isolated homes. Original `E` logs were preserved. New evidence directory **M**: `T\vs31\mxc`; driver: `vs31-mxc.mjs`. No HCC rebuild, installation, persistent parent config edit, security-setting change or administrative provisioning occurred.

### Documented settings and installed diagnostics

The installed CLI exposes `codex doctor --json` as a redacted diagnostic and `codex sandbox -P <profile> -C <directory> -- <command>` for non-inference execution. Official documentation distinguishes preference from explicit selection: `features.prefer_mxc=true` may retain the legacy backend when capabilities/policy do not allow MXC; explicit `windows.sandbox=mxc` fails rather than silently accepting an unavailable MXC backend. All overrides here were invocation-local. See the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Official documentation places native MXC capability on compatible Windows 11 devices and supplies an explicit-selection startup probe for CLI 0.162.0 or later. This host is Windows 10. More decisively, actual explicit-MXC command startup failed as shown below. No successful MXC launch is inferred from a preference/configuration flag. See [Windows sandbox compatibility](https://learn.chatgpt.com/docs/windows/windows-sandbox).

| Diagnostic                                        | Observed sandbox check                                                      | Interpretation                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `codex doctor --json`                             | backend `disabled`; restricted filesystem/network; denied-read rule present | Existing configuration cannot satisfy the restricted-read policy                             |
| `codex -c features.prefer_mxc=true doctor --json` | backend still `disabled`; same denied-read prerequisite failure             | Preference did not select a working MXC backend                                              |
| `codex -c windows.sandbox=mxc doctor --json`      | backend `mxc`; “sandbox configuration is readable”                          | Explicit config was recognized; this check alone does **not** establish runtime availability |
| Explicit-MXC real sandbox command                 | `failed to prepare MXC sandbox: native MXC is unavailable on this executor` | Actual backend preparation failed; no sandboxed command launched                             |

Doctor's explicit-MXC sandbox check reporting `ok` describes readable configuration, not successful isolation. The actual startup probe is the decisive control. Redacted doctor reports also show missing auth in the credential-stripped diagnostic environment and TLS certificate failures in reachability checks. Those are incidental non-inference diagnostics, not proof of an authenticated model failure. No TLS verification was disabled.

### Synthetic canary and ordinary-access controls

Created only this test-owned, non-secret file:

```text
T\vs31\mxc\canary\outside.txt
```

Its contents are the literal test marker `VS31_TEST_OWNED_CANARY_NO_SECRETS`. It is outside both consumers' fixture roots and isolated child homes. The original `task` permission profiles were unchanged: root deny, minimal runtime read, workspace read, isolated-home read, tool networking disabled.

Ordinary parent-context `readFile` controls successfully read **both** existing `entries.txt` fixtures and the canary, confirming the targets exist and ordinary permissions do not prevent the current caller reading them. No file ACLs were modified. These controls establish a valid test target; they do not substitute for sandbox enforcement.

The sandboxed probes separately attempted the permitted fixture and outside canary using `Get-Content -LiteralPath <absolute-path> -ErrorAction Stop`. The same target/command was used for direct native and Arch-routed controls. The explicit command shape was:

```text
codex -c windows.sandbox="mxc" --sandbox read-only sandbox
  -P task -C <existing-fixture> -- <Windows PowerShell>
  -NoProfile -Command "Get-Content -LiteralPath '<target>' -ErrorAction Stop"
```

The PowerShell route used real mise activation plus prompt refresh. The Bash route used actual Git Bash plus mise activation/hook refresh. Native spawn records confirm the delivered override and target; the planned read utility being PowerShell does not change the outer routing shell.

| Probe, each run once            | PowerShell direct / routed                          | Git Bash fixture direct / Bash-routed |
| ------------------------------- | --------------------------------------------------- | ------------------------------------- |
| Prefer MXC, permitted fixture   | 1 / 1; original elevated-backend prerequisite error | 1 / 1; same error                     |
| Explicit MXC, permitted fixture | 1 / 1; native MXC unavailable                       | 1 / 1; native MXC unavailable         |
| Explicit MXC, outside canary    | 1 / 1; native MXC unavailable                       | 1 / 1; native MXC unavailable         |

All twelve command probes failed before executing the read utility. Therefore **permitted sandbox read: BLOCKED; canary enforcement: NOT TESTED**. In particular, canary command exit 1 is an infrastructure failure, **not** an accepted denied-read result. The intended boundary has not passed, despite ordinary target readability.

Direct-native controls are deliberately explicit native executable calls; only routed controls count as Arch interception. New live ancestry/spawn observations and Arch events support routing in both shells. They remain CLI preflights, not semantic delegation.

### Bounds, cleanup and final decision

Each new command probe had a 20-second limit. All completed without timeout: direct controls took 80–92 ms, routed PowerShell 1,539–1,706 ms, routed Bash 5,456–5,985 ms. No retries of an inference run occurred. Default/preferred/explicit doctor diagnostics were separate finite non-inference checks.

The three protected parent files (`config.toml`, `auth.json`, `hooks.json`) remained byte-unchanged across the MXC command sequence. All **24 recorded Node/native process observations** were absent at the final cleanup check (`M\cleanup.json`). Routes restored for these probes were deinitialized afterward. HCC source diff/status remained clean. Existing fixtures, expected answers and original failure logs were preserved. Credentials were removed from all new diagnostic/control environments, and no tokens were logged.

Evidence inventory: `M\doctor-{default,prefer,explicit-mxc}.json`; `{ps,bash}-{native,routed}-{prefer-allowed,explicit-allowed,explicit-canary}.json`; exact `.ps1/.bash` scripts; `{ps,bash}-process.jsonl`; `summary.json`; `cleanup.json`.

**Final continuation verdict: Sandbox prerequisite BLOCKED.** Native MXC is unavailable in this Windows executor, and the restrictive policy cannot run on the existing backend. Stop the Windows path. Semantic inference, child tool-read events, child output/session comparisons and usage remain **NOT TESTED**, with **zero of the two authorized child inference invocations consumed**. This remains an environment limitation, not a confirmed Arch defect.

The next recommended execution environment is Ubuntu WSL2 with Linux-native Codex and its Linux sandbox. Reuse the same HCC SHA and synthetic task expectations; first demonstrate a permitted read and an enforced outside-canary denial with ordinary-read controls, then perform only the bounded semantic invocation(s) authorized for that repetition. Do not provision Windows security infrastructure or weaken this profile to manufacture a PASS.
