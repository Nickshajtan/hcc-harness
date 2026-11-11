# Codex VS-3 child WSL2 — BLOCKED

Executed 2026-11-05, Europe/Kiev. Independent validation of HCC milestone VS-4.0. HCC source unchanged; no commits or PRs.

Report directory resolved from the supplied task and existing reports: `/mnt/d/AI/arch-validation`. Active workspace and all build dependencies, installations, consumers, fixtures, isolated child state and raw diagnostics remain on ext4 at **W** = `/home/nikita/arch-validation/vs-1.1b/vs-4`. `logs/` contains the earlier attempt; **`logs-current/` contains this execution's rerun**. Reports consolidate inspected earlier evidence with newly executed checks, identifying reused evidence below.

Ubuntu 22.04.4; WSL2 kernel `5.10.102.1-microsoft-standard-WSL2`; x86_64. Native Linux Node **24.22.2**, npm **11.19.1**, Git **2.34.1**, mise **2026.11.0**, Codex **0.166.0**. Controlled PATH excludes Windows mounts. Native executable provenance and ext4 mount are recorded in `logs-current/environment.json` and `processes.jsonl`. No Windows provider launcher was executed.

Exact required source **`b4c35238614e1df7dc696b05bb286ae6c34b2825`** successfully fetched from `https://github.com/Nickshajtan/hcc-harness.git` in this execution; HEAD and FETCH_HEAD match (`logs-current/fetch.json`, `sha.json`). The earlier DNS blocker is resolved. No newer revision substituted. Final source status is clean. Prior Claude WSL2 and Gemini/Codex/child Windows reports were consulted for test contracts, without treating Windows success as Linux evidence.

Independently installed Arch: `W/installed-offline/arch`, built using the supported `npm run install:stable -- --destination <absolute-path>` workflow. Reused installation logs: `logs/install-offline.txt`, `npm-ci-headers.txt`. Existing cached dependencies and Node headers were used; the earlier incomplete `W/installed` destination is unused. Current manifest verification checks **90 files, zero mismatches**, executable permission present (`logs-current/integrity.json`). Reused source-independence evidence: installed help and routed Codex version passed while the owned checkout was temporarily renamed and then restored (`logs/independent-*.json`). Reused synthetic hard-link inode/symlink-read checks pass (`logs/posix-links.json`). No filesystem stress campaign repeated.

## Windows context and Linux prerequisite

Windows previously failed before model execution: the chosen restricted-read policy required an unavailable elevated backend; explicit MXC also could not start. That was an environment limitation, not a demonstrated Arch defect. This Linux test uses the actual installed CLI's supported `codex sandbox -P task -C <task> -- <command>` syntax, verified by current help; no Windows backend setting was reused.

The native Linux error identifies bubblewrap preparation as the failing stage. Current [official permission-profile documentation](https://learn.chatgpt.com/docs/permissions) was consulted; installed help and actual execution supply the acceptance evidence. Intended isolated `W/child-home/config.toml`:

```toml
approval_policy = "never"
default_permissions = "task"
sqlite_home = "<W>/child-sqlite"
[permissions.task.filesystem]
":root" = "deny"
":minimal" = "read"
"<W>/task" = "read"
[permissions.task.network]
enabled = false
```

`<W>` expands to the evidence root above. This is the requested policy, not an asserted effective running boundary. No root read, work repository access, broad temporary-directory access or parent-home grant was added. Runtime/auth usability inside this boundary is NOT TESTED because startup failed; no authentication material was copied.

## Synthetic controls and actual failure

Only synthetic fixtures are involved: `W/task/entries.txt` contains four unordered name/value entries; `W/outside-canary.txt` is a non-secret file outside the permitted root. Ordinary `/bin/cat` reads both successfully, exit 0 (`logs-current/control.json`). Thus both exist and ordinary Unix permissions permit reading.

| Current probe | Exit | Interpretation |
| --- | --- | --- |
| Ordinary allowed + canary read | 0 | Both readable outside intended sandbox |
| Native sandbox allowed read | 1 | Startup failure |
| Native sandbox canary read | 1 | Same startup failure; no denial proof |
| Arch-routed sandbox allowed read | 1 | Same startup failure |
| Arch-routed sandbox canary read | 1 | Same startup failure |

All four sandbox attempts return:

```text
error building bubblewrap command: app-server socket directory must be a user-owned directory with mode 0700
```

Raw command/cwd/output/status/duration: `logs-current/sandbox-{native,routed}-{allowed,denied}.json`. No timeout. Earlier clean-environment diagnostics reproduced the same failure (`logs/clean-sandbox-*.json`). Earlier inspection found the outer sandbox masks `/tmp/codex-daemon-1000` at mode 000; this is consistent context, not an exhaustive proven root cause. No host security policy or socket mode was changed.

**Permitted sandbox read: BLOCKED. Enforced outside denial: NOT TESTED.** The canary exit 1 cannot count as security enforcement because the allowed control fails identically before executing cat. Private/work directory exclusion and usable runtime/auth facilities inside the intended sandbox remain NOT TESTED. No inference may proceed under the supplied contract.

## Delegation, identities and limits

**Actual real child Codex inference count: 0 of at most 1 conditionally authorized invocation.** No child prompt was submitted, no direct native model control substituted, and no inference retry or grandchild spawned. No danger-full-access, yolo, skip-git-repo-check, host-policy change or broad filesystem workaround was used.

Current parent Bash tool → installed Arch → genuine Linux child Codex is established for non-inference CLI commands by `logs-current/agent-route.json`, `processes.jsonl` and execution events. Earlier routed sandbox observer records in `logs/processes.jsonl` show Arch PID 109 → genuine wrapper 122 for the permitted-file diagnostic, and 161 → 174 for canary diagnostic; these are earlier namespace-local PIDs, not current semantic-agent identities. Current routed sandbox calls return the identical native error to the parent. None of these diagnostic launches is presented as a semantic agent run.

Expected synthetic answer: alphabetically sorted names `alpha`, `beta`, `delta`, `gamma`, sum **38**. The parent knows this from the fixture; contents were not sent to any model. Actual child session/thread identifier, tool-read event, final JSON answer, usage information and independent answer verification are all **NOT TESTED**, not fabricated from the expected arithmetic. Inherited thread metadata is only a boolean and does not establish shared identity.

Current and reused parent-state observations show protected config/auth unchanged; parent SQLite databases were not opened/copied/repaired. Current consumer deinit exits 0 and the parent remains responsive. All four diagnostic processes completed, no persistent test-owned descendants observed; global process visibility is limited by the outer namespace. Raw logs remain on ext4, reports contain no credentials or session-token values.

## Verdict

**BLOCKED. Can a real Codex child agent safely execute the synthetic tool-using task through Arch on this WSL2 executor? Not established.** The native restricted-read sandbox cannot prepare, equally through Arch and directly. This prevents the required security controls and correctly stops model execution. It is not a demonstrated Arch routing defect. A future separately executed test must first pass permitted-read and enforced-denial controls in a supported environment. Linux results do not resolve the Windows sandbox limitation.


## VS-4.0 focused sandbox diagnostic addition — 2026-11-05

Original report above preserved. Scope: non-inference sandbox diagnosis only; no provider-routing suite repeated, production source changes, commits or PRs. Evidence root remains **W** above; new raw evidence is `W/logs-sandbox-addition/`, reproducible driver `W/sandbox-addition.py`. Independently installed `W/installed-offline/arch` supplied a disposable route in `W/sandbox-addition-consumer`; deinit completed with exit 0 afterward.

### Execution boundary and socket ownership

Compared ordinary nested shell-tool execution with an explicitly approved execution outside the parent sandbox, using `/usr/bin/python3` and the same native provider, fixtures, child profile and controlled Linux PATH. The outside control is a noninteractive host-shell invocation through the executor's escalation facility, not a separately opened interactive terminal; it demonstrably uses a different mount namespace. No inference, unrestricted Codex mode, socket chmod/chown, host-policy modification, or protected-directory mutation was used.

| Observation | Inside parent execution sandbox | Outside parent execution sandbox |
| --- | --- | --- |
| Mount namespace | `mnt:[4026532212]` | `mnt:[4026532206]` |
| Socket directory | `/tmp/codex-daemon-1000` | Same path |
| Directory owner/group | UID/GID 1000/1000, same as process | UID/GID 1000/1000, same as process |
| Effective mode | `000` | `0700` |
| Mounts directly masking directory | Two read-only tmpfs mounts, both `mode=000` | None |

`nested-context.json` and `host-context.json` capture stat and matching mountinfo records. Ownership is correct in both views; permissions and visibility differ because of mounts. No socket contents or credential values were collected. Child `CODEX_HOME` is isolated, PATH is Linux-only, `CODEX_THREAD_ID` inheritance is recorded only as a boolean. Neither TMPDIR nor XDG_RUNTIME_DIR nor the two recorded CODEX_SANDBOX flags were present. The runtime-grant controls use a second isolated home `W/sandbox-addition-home`, containing only a synthetic config. The context snapshots precede that home substitution; effective home/config are shown by the driver and retained config. Environment adjustments are identical between execution boundaries.

### Two distinct startup blockers and controlled results

With the original profile unchanged, both nested native and nested Arch probes fail with the original socket-mode error, before executing cat. Outside the parent sandbox, both pass socket validation and reach bubblewrap, then fail with `bwrap: execvp <native Codex binary>: No such file or directory`. The actual binary exists and is executable outside the child policy (`*-runtime.json`). The original root-deny profile hides the native runtime installed under the user's home.

A second isolated profile adds **read access to exactly one installed runtime binary**, preserving root deny, minimal system reads, task-only synthetic data access and disabled network. No parent home, credentials, repositories, full installation tree or broad filesystem read was granted. Added entry under `[permissions.task.filesystem]`:

```toml
"/home/nikita/.local/share/mise/installs/node/24.22.2/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex" = "read"
```

Final controls are `host-runtime-profile-v2-*.json` and `nested-runtime-profile-v2-*.json`:

| Boundary / route | Allowed entries read | Outside canary read |
| --- | --- | --- |
| Outside / native | Exit 0, exact fixture contents | Exit 1, hidden by sandbox filesystem view |
| Outside / Arch | Exit 0, same exact contents | Exit 1, same hidden-file result |
| Nested / native | Exit 1, socket-mode startup error | Same startup error |
| Nested / Arch | Exit 1, socket-mode startup error | Same startup error |

Both ordinary controls read both files with exit 0. In successful outside sandbox runs, cat executes and reports the canary as `No such file or directory`: this is **sandbox-enforced hiding**, not a nonexistent host fixture or ordinary Unix permission failure. The existing host canary was readable immediately before those runs. Successful allowed reads distinguish these results from startup failure. This control establishes the intended synthetic boundary; it does not exhaustively audit every accessible runtime path.

Exploratory logs are retained: `nested-runtime-*` captures a rejected dotted CLI override (configuration parse failure, no sandbox execution); `nested-runtime-profile-*` used the original profile because its diagnostic label did not select the runtime variant. Neither is counted as a successful security control. The final `*-runtime-profile-v2-*` runs use the explicit isolated TOML file and establish the comparison.

The installed CLI help was inspected; the [official developer-command documentation](https://learn.chatgpt.com/docs/developer-commands) describes sandbox command execution. The conclusions here rest on executed controls, not assumptions from documentation.

### Classification and readiness

**Classification: nested-sandbox incompatibility.** The immediate original failure is caused by the parent execution sandbox masking the app-server socket directory at mode 000. Outside that namespace the directory already satisfies ownership/mode requirements without modification. Native and Arch behavior match at every stage; no Arch-specific defect is demonstrated. A secondary runtime-visibility omission in the original restricted profile is resolved for these non-inference controls by the exact-binary read grant; this is not evidence that WSL2 lacks sandbox support.

**Overall semantic-delegation verdict remains BLOCKED from the current nested executor.** Outside the parent sandbox, filesystem prerequisites now PASS through Arch, so the synthetic task is ready for a **separately authorized single inference attempt from that outside execution context**, conditional on supported authentication/network setup that preserves the boundary. Runtime execution is proven, but authentication and model connectivity were not tested; current diagnostic policy has network disabled and no copied authentication. This is readiness for an attempt, not proof of complete semantic delegation or unconditional inference readiness. Do not run inference from the current nested context or weaken its socket masks.

**Inference count remains 0.** No model prompt, semantic child session, child tool-read event, final answer or token usage exists. All diagnostic subprocess calls returned within the 25-second bound; no timeout occurred. Parent remains responsive. Parent configuration, authentication, SQLite state and executable installation were not modified by this diagnostic. Protected runtime directory permissions were never changed. Safe diagnostics stop here because the cause is established.
