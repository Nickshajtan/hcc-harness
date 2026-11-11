# Codex VS-3 WSL2 — CONDITIONAL GO

Executed 2026-11-05, Europe/Kiev. Independent validation of HCC milestone VS-4.0. HCC source unchanged; no commits or PRs.

Report directory resolved from the supplied task and existing reports: `/mnt/d/AI/arch-validation`. Active workspace and all build dependencies, installations, consumers, fixtures, isolated child state and raw diagnostics remain on ext4 at **W** = `/home/nikita/arch-validation/vs-1.1b/vs-4`. `logs/` contains the earlier attempt; **`logs-current/` contains this execution's rerun**. Reports consolidate inspected earlier evidence with newly executed checks, identifying reused evidence below.

Ubuntu 22.04.4; WSL2 kernel `5.10.102.1-microsoft-standard-WSL2`; x86_64. Native Linux Node **24.22.2**, npm **11.19.1**, Git **2.34.1**, mise **2026.11.0**, Codex **0.166.0**. Controlled PATH excludes Windows mounts. Native executable provenance and ext4 mount are recorded in `logs-current/environment.json` and `processes.jsonl`. No Windows provider launcher was executed.

Exact required source **`b4c35238614e1df7dc696b05bb286ae6c34b2825`** successfully fetched from `https://github.com/Nickshajtan/hcc-harness.git` in this execution; HEAD and FETCH_HEAD match (`logs-current/fetch.json`, `sha.json`). The earlier DNS blocker is resolved. No newer revision substituted. Final source status is clean. Prior Claude WSL2 and Gemini/Codex/child Windows reports were consulted for test contracts, without treating Windows success as Linux evidence.

Independently installed Arch: `W/installed-offline/arch`, built using the supported `npm run install:stable -- --destination <absolute-path>` workflow. Reused installation logs: `logs/install-offline.txt`, `npm-ci-headers.txt`. Existing cached dependencies and Node headers were used; the earlier incomplete `W/installed` destination is unused. Current manifest verification checks **90 files, zero mismatches**, executable permission present (`logs-current/integrity.json`). Reused source-independence evidence: installed help and routed Codex version passed while the owned checkout was temporarily renamed and then restored (`logs/independent-*.json`). Reused synthetic hard-link inode/symlink-read checks pass (`logs/posix-links.json`). No filesystem stress campaign repeated.

## Native and routed CLI

Linux native resolution is the mise Node installation's `@openai/codex/bin/codex.js`; the wrapper launches the package's native `codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex` ELF. Current observation records show installed Arch Node PID 73 → genuine Codex wrapper PID 86 for version; help uses 110 → 123, exec-help 147 → 160. These PIDs are local to that shell tool namespace. The namespace's PID 1 is a Linux Codex binary; it is not sufficient evidence of the host parent session's identity. Reused live ELF sampling is retained in `logs/live-process-sample.json`.

| Command                      | Native exit | Routed exit | stdout equality | Provider stderr equality |
| ---------------------------- | ----------- | ----------- | --------------- | ------------------------ |
| `codex --version`            | 0           | 0           | Exact           | Exact                    |
| `codex --help`               | 0           | 0           | Exact           | Exact                    |
| `codex exec --help`          | 0           | 0           | Exact           | Exact                    |
| `codex --vs4-invalid-option` | 2           | 2           | Exact           | Exact                    |

Current results: `logs-current/native-*.json`, `route-*.json`. Diagnostic runs enable Arch traces and demo middleware; raw routed stderr includes extra `[arch:event]` and `[arch:demo]` lines. Only these lines are removed for provider-stderr comparison. Raw stderr byte parity is not claimed. Normal exit and returned output are demonstrated without model calls.

## Terminal → Arch → Codex

Current PTY execution uses real `/bin/bash --noprofile --norc -i`, `mise activate bash` and prompt hooks. Outside the consumer, `command -v` selects native Codex. Entry selects `W/codex-consumer/.arch/bin/codex`; `type -a` agrees. Real version/help/exec-help/invalid commands return 0/0/0/2. Leaving restores native resolution; re-entry restores Arch and successful version output. Evidence: `logs-current/activation-extended.ansi`, exit JSON and `terminal-driver.json`. This is an automated genuine interactive terminal test initiated by the parent shell tool, not an independently operated human terminal.

## Codex → Arch → Codex

The current parent invoked `continue.py` using its actual Bash shell tool. Its controlled Bash explicitly evaluates `mise activate bash` and `mise hook-env -s bash` in the consumer before ordinary Codex commands. Activation is explicitly established in that child shell, not naturally inherited. `agent-route.json` records actual cwd, shell PID/PPID, command resolution, Arch execution/completion events and returned version/help/exec-help output; all three return 0.

Observer records in `processes.jsonl` establish installed Arch → genuine provider wrapper execution, with the consumer cwd, synthetic sentinel, and isolated `W/child-home` preserved. They show one Arch boundary per command, with no recursive launcher chain. Missing-native/recursive-wrapper behavior is also covered by the passing focused suites. These are process delegation observations; no semantic child session is inferred from a version command.

## Parent protection, state and cleanup

The parent executable, authentication, config, home, SQLite databases and active lifetime were not modified. No parent home or credential was copied. Diagnostic children use `W/child-home`, with SQLite configured separately at `W/child-sqlite`. The route preserves that home. Parent config/auth hashes remain unchanged over current final verification; unavailable hooks remain unasserted (`logs-current/parent-integrity.json`). SQLite files were not opened, copied or repaired; database integrity/concurrency under authenticated child execution is NOT TESTED. Parent responsiveness is demonstrated by continuing execution and report delivery.

Inherited `CODEX_THREAD_ID` is recorded only as presence, never its value; it proves no internal session identity. No inference-produced child thread exists.

Current real CLI startup cancellation sends SIGINT/SIGTERM to native and routed `--help` processes after 15 ms; results in `logs-current/signals.json`. This measures startup only, not mature TUI handling. Reused waiting synthetic-provider signal tests (`logs/fixture-signals.json`) show native -2/-15, routed 130/143, cleanup, and no remaining known descendants. Synthetic fixture evidence does not establish long-running real Codex behavior. Authenticated TUI cancellation remains NOT TESTED. Current bounded commands complete without timeouts; final cleanup deinitializes consumers. No persistent test-owned process or uncontrolled spawn was observed; namespace-local observations cannot prove a global host process census.

All three genuine Linux provider routes pass version calls in a fresh multi-provider consumer: Claude, Gemini and Codex. Removing Gemini preserves both Claude and Codex routes and successful version output. Deinit preserves the foreign file and its inode. Evidence: `W/logs-gemini/multi-*.json`, `foreign.json`. All test routes were deinitialized. No cross-provider inference occurred.

## Focused regressions and verdict

Focused existing regression suites were rerun against the stationary exact checkout:

```sh
vitest run tests/unit/resolution.test.ts tests/unit/environment.test.ts \
  tests/unit/process-policy.test.ts tests/unit/process.test.ts \
  tests/unit/ownership.test.ts tests/unit/publication-resource.test.ts \
  tests/integration/process.test.ts tests/integration/lifecycle.test.ts \
  tests/integration/publication-consumer.test.ts \
  --reporter=json --outputFile=../logs-current/regression.json
```

**PASS: 144 passed, 0 failed, 6 pending/platform skips; nine suites pass, command exit 0.** Full per-test skip records are retained in JSON. Earlier `logs/regression-final.json` had 27 failures, including empty subprocess output; this execution does not reproduce those failures. The cause of the changed executor behavior is unproven. Earlier failures remain preserved, rather than silently removed. Full quality, mutation, Windows and VS-1.1b stress suites were outside this focused validation and NOT TESTED; no CI result claimed.

**CONDITIONAL GO. Is Codex correctly routed through Arch on WSL2, including self-invocation? Yes for the measured non-inference CLI paths.** Genuine interactive Bash activation and current-parent shell invocation both reach the independently installed Arch and native Codex with expected output/status. Condition: mature TUI semantics remain unverified. Three-provider version routing, route removal and ownership isolation now pass after the authorized native Gemini installation. Semantic child delegation is separately BLOCKED and does not invalidate these process-routing observations.
