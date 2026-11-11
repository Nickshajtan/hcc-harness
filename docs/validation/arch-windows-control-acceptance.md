# Arch Windows control acceptance — F1–F5

2026-11-07, Europe/Kiev. Repository: `Nickshajtan/hcc-harness`.

**Verdict: CONDITIONAL GO — environment-limited.** Selected Arch product checks
passed on the merged revision, including W1–W4 on their first run and real
non-inference provider routing in both shells. A bounded node-pty test-driver
cleanup limitation remains. Active-Avast compatibility remains unverified and is
tracked separately in [issue #25](https://github.com/Nickshajtan/hcc-harness/issues/25).
This supersedes the previous blocked preflight report under the user's explicit
Avast override. It is not Windows 11 or authenticated interactive acceptance.

## 1. Merge and environment

[PR #24](https://github.com/Nickshajtan/hcc-harness/pull/24) merged at
`2026-11-07T03:26:20Z`. GitHub PR metadata, a separate current `main` lookup and a
fresh upstream clone agreed on exact SHA:

**`d028df2d4d76da17bc730234a866316449c04d53`**.

The upstream clone is `D:/AI/arch-validation/arch-windows-control-source`.
Its initial and final tracked working-tree checks were clean. Existing historical
checkouts were preserved. SSH fetch initially failed on inaccessible known_hosts;
default HTTPS failed on its configured CA bundle, and schannel returned
`SEC_E_NO_CREDENTIALS`. Actual upstream acquisition succeeded with Git's installed
CA bundle, retaining TLS verification:

```powershell
git -c http.sslBackend=openssl -c 'http.sslCAInfo=C:/Program Files/Git/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem' clone -- https://github.com/Nickshajtan/hcc-harness.git arch-windows-control-source
```

| Component    | Observed                                                       |
| ------------ | -------------------------------------------------------------- |
| Windows      | Windows 10, NT 10.0.19045.0, x64                               |
| PowerShell   | Windows PowerShell 5.1.19041.6456                              |
| Git / Bash   | 2.46.2.windows.1 / 5.2.37(1)-release                           |
| MSYS         | MINGW64, 3.4.10-bc1f6498.x86_64                                |
| Node / npm   | Native Windows v24.19.0 / existing 12.0.2 toolchain            |
| mise         | Existing 2026.10.11 Windows executable                         |
| Build SDK    | Explicit 10.0.17763.0                                          |
| Shell driver | node-pty 1.1.0, Windows ConPTY                                 |
| Filesystems  | Report/source clone on D: exFAT; execution fixtures on C: NTFS |

Read the merged stabilization record, nested-execution decision, repository
instructions and applicable testing, determinism and quality-gate policies.
Reviewed previous local Claude VS-1, Gemini VS-2 and Codex VS-3 Windows findings.
Historical routing results were not counted as new passes.

## 2. Avast state

**User-reported:** protection temporarily disabled for this controlled run.
**Observable:** SecurityCenter2 antivirus query denied access, HRESULT
`0x80041003`; exact shield/AutoSandbox state independently unknown.
**Existing narrow exclusions:** unknown; none configured or changed.
**Current-run intervention:** no AutoSandbox decision collected or attributed.

The Windows lifecycle investigation and controlled comparison in
[docs/stabilization-f1-f5.md](https://github.com/Nickshajtan/hcc-harness/blob/d028df2d4d76da17bc730234a866316449c04d53/docs/stabilization-f1-f5.md)
record historical active-protection readiness timeouts, suspended bootstrap
instances and retained executable images, versus passes with protection
user-reported disabled. The precise initiating mechanism remains unresolved.
No additional Avast A/B test or security change was performed here.

[Issue #25](https://github.com/Nickshajtan/hcc-harness/issues/25) separately records
interference, reproducible symptoms, affected generated provider launchers,
stable arch.exe/bootstrap, console/native fixtures and Node process chain.
Determining narrowly scoped sandbox exceptions is deferred until after Windows,
WSL2 and macOS acceptance. No broad exclusions are proposed. The user remains
responsible for restoring protection after the controlled testing period.

## 3. Independent installation and isolation

Owned root: `C:/Users/38098/AppData/Local/Temp/arch-control-c0a9c000`.
A fresh `--no-hardlinks` local clone of the fetched merge supplied `source`.
Existing development dependencies were reused through an NTFS junction;
the supported stable installer materialized its independent production resources.

```powershell
$env:ARCH_WINDOWS_SDK='10.0.17763.0'
$env:npm_config_offline='true'
npm.cmd run build
npm.cmd run build:bootstrap
npm.cmd run install:stable -- --destination C:/Users/38098/AppData/Local/Temp/arch-control-c0a9c000/installed
```

All passed. Installation identity was `arch-stable-installation-v1`, with
**92/92 resource hashes matching**. Before real-provider routing, `source` was
renamed to `source-unavailable`; installed `arch.exe --help` and all later routes
passed. W2 also independently exercised source relocation and replacement runtime.
Final execution-source working-tree status was clean.

Preparation failure retained: attempting a dependency junction on exFAT returned
`Incorrect function`; the subsequent build lacked `tsc`. Moving execution to
NTFS satisfied that prerequisite. It was not an acceptance assertion retry.

Disposable PowerShell/Bash consumers, native fixtures, provider homes, SQLite,
mise configuration/data/cache and logs were isolated. Children received isolated
HOME/USERPROFILE, CLAUDE_CONFIG_DIR, GEMINI_CLI_HOME, CODEX_HOME and sqlite_home.
Credential/token/API-key and inherited session variables were filtered from child
environments without printing values. No authentication files, personal/corporate
provider configuration or real projects were copied or edited.

## 4. Real CLI routing

| Provider    | Independent entry/target                                                                                     | Version |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| Claude Code | `C:/Users/38098/.local/bin/claude.exe`                                                                       | 2.1.280 |
| Gemini CLI  | `%APPDATA%/npm/gemini` wrappers → Windows Node, `@google/gemini-cli/bundle/gemini.js`                        | 0.55.1  |
| Codex CLI   | `C:/nvm4w/nodejs/codex` wrappers → `@openai/codex/bin/codex.js` → native `codex-win32-x64/.../bin/codex.exe` | 0.163.0 |

Native entries were identified independently; npm shim targets were inspected.
Each provider ran directly and through project-local `mise exec` for `--version`
and `--help` in **PowerShell 5.1 and Git Bash**. All 12 paired checks passed:
matching stdout, stderr after removing intentional Arch trace events, and exit
code 0. No launch timed out or requested inference. Provider-specific output and
Arch events identified the intended route. Codex emitted the same temporary-home
helper warning directly and routed; both completed successfully.

Actual interactive ConPTY shells activated mise, entered the project, ran Codex
version, left and re-entered. Both resolved generated launchers inside, the native
npm wrapper outside, then generated launchers again. PowerShell's known mise
chpwd warning requires PS7, but PS5.1 prompt activation worked. Git Bash selected
the generated extensionless route. Other providers used explicit mise checks.

A controlled copied native Node executable verified cwd, stderr, arguments and
exit **37** directly and through generated routing. Spaces and Unicode matched
in both shells. Git Bash preserved an empty argument. **PS5.1 dropped the empty
argument in both direct and routed invocation**, establishing a shell limitation
rather than demonstrated Arch corruption. Routed ARCH_ACTIVE matched its current
execution event. Real-provider internal argv/cwd were not instrumented; these
transport properties are established by fixtures and W2.

No launcher resolved recursively into itself. Selected resolver regressions
refused copied marked launchers, generated Windows shim targets and an actual
generated wrapper cycle.

## 5. F3 nested execution

Existing deterministic three-level tests passed for exits **0 and 17**: three
unique IDs, immediate parent correlation, correct provider-B executable,
independent preflight/prepare/finalize events, reverse completion order, propagated
status and three middleware cleanups. Spoofed inherited ARCH_ACTIVE caused no
false refusal. No native-passthrough shortcut was accepted.

An additional independent stable two-level chain
`Arch A → probe.exe fixture → Arch B → probe.exe fixture` returned **23**.
IDs were `04538373-b3e0-4397-b6be-4e2504be4982` and
`6a771543-947f-46fa-a1aa-3925d18b1b7e`; B's parent event named A.
Both emitted independent lifecycles with the empty starter pipeline. Native
fixture output identified probe.exe and the current ARCH_ACTIVE.

Toolhelp ancestry observed active parent Codex PID 6768 → command runner →
PowerShell → driver PID 8264. That driver launched installed Arch and real
providers' version commands, recording PIDs and close/status results. This is
process-level invocation from Codex tooling, not semantic model delegation.
No continuous trace of every transient native descendant was collected.

## 6. W1–W4, run once

From the clean execution checkout, with SDK 10.0.17763.0, offline npm,
`npm_execpath=C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js` and
`MISE_BIN=D:/AI/projects/projects/harness/.tools/mise/bin/mise.exe`:

```powershell
node node_modules/vitest/vitest.mjs run tests/integration/stable-runtime.test.ts tests/integration/process.test.ts -t 'builds, installs|preserves console signals|handles real Windows Ctrl|mise activates' --maxWorkers=1 --reporter=default --reporter=json --outputFile=D:/AI/arch-validation/evidence/windows-control/w1-w4.json
```

| Check                                                                               | Result                  |
| ----------------------------------------------------------------------------------- | ----------------------- |
| W1 real Ctrl+C/Ctrl+Break, readiness, cleanup, native child absence                 | PASS, 817 ms            |
| W2 install/routing, relocated source, replacement runtime, safe deinit              | PASS, 4,932 ms          |
| W3 stable generated routing, both control events, middleware cleanup, child absence | PASS, 1,726 ms          |
| W4 executable unlink / automatic fixture teardown                                   | PASS; no teardown error |
| mise configured/unconfigured comparator                                             | PASS, 658 ms            |

**4 passed, 21 selection skips, two suites passed, exit 0**, 22.91 s.
W4 is teardown, not an additional test. Original assertions and deadlines were
unchanged; no retry-to-green occurred. Internal Windows status assertions accept
130/149 or `0xC000013A`; JSON does not expose which accepted status each iteration
returned. These were real Windows console events, not POSIX SIGINT substitutes.

## 7. Hooks, ownership and cleanup

Isolated inert `hooks: {}` files for all three providers remained byte-identical
after installed Arch launched their version commands. Environment composition
inspection showed inherited provider settings retained apart from routing PATH
and execution identity. No hook adapter, hook rewrite or management operation was
performed. File preservation does not prove provider consumption of each file.
**No real native hook event was triggered; hook-event compatibility is untested.**

Selected tests recognized exact legacy/new starters, removed owned unchanged
content and preserved customized variants. Each real-provider consumer removed
Claude while Codex remained functional. Final deinit preserved customized harness
configuration and foreign `foreign.txt`. The independent installed tree was
removed without retry or Arch/provider termination, before driver cleanup.

W1/W3 asserted native child absence; final Toolhelp scans found zero executable
images under the owned root. The PTY shells exited 0, but node-pty retained its
driver PID 8264 and two conhost helpers, 20332 and 4776. Evidence was retained,
then only that verified driver/helper tree was terminated. Final descendant and
owned-root scans returned `[]`. The driver session ended with termination status
-1, not a clean driver exit. This bounded instrumentation limitation prevents an
unconditional claim of automatic cleanup for every test-owned process. Stable
installation removal had already succeeded; no Arch bootstrap leak was observed.

## 8. Evidence, failures and limitations

Evidence directory: `D:/AI/arch-validation/evidence/windows-control/`.

| Files                                                         | Evidence                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| `w1-w4.{json,log,exit}`                                       | Original assertions, durations, skips, exit                    |
| `f3-ownership.{json,log}`                                     | Seven passes / 55 selection skips: nested, ownership, resolver |
| `native-*`, `routed-*`, `routing-checks.json`                 | Provider/shell commands, PIDs, cwd, streams, parity            |
| `activation-{ps,bash}.json`                                   | Interactive resolution, re-entry, shell exits                  |
| `args-*`, `stable-nested-two.json`                            | Argument boundaries, identities, nesting                       |
| `installation-integrity.json`, `source-unavailable-help.json` | Hashes and independent launch                                  |
| `hooks-*`, `deinit-*`, `retained-codex-*`                     | Hook-file observation and ownership operations                 |
| `process-ancestry.json`, `remaining-owned*.json`              | Parent ancestry, owned-image absence                           |
| `driver-retention*.json`, `finish-driver.log`                 | Instrumentation retention and final absence                    |

External reproducible drivers: `control-acceptance.mjs`, `control-finish.mjs`;
`control-root.txt` locates retained fixtures. Local diagnostic state is not a
publication requirement. No production code was changed.

**Product:** no reproducible routing, recursion or W1–W4 defect found in this
targeted pass. **Noncritical limitations:** PS5.1 empty-argument parsing,
node-pty helper teardown and incomplete native-hook event coverage.
**External environment:** active Avast remains unresolved in issue #25.

No full suite, mutation campaign, paid inference, authenticated TUI, Windows 11,
WSL2/macOS acceptance, unrelated merge or additional Avast investigation was run.
Green CI was not substituted for real-provider acceptance.
