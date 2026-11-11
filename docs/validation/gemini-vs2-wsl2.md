# Gemini VS-2 WSL2 — CONDITIONAL GO

Executed 2026-11-05, Europe/Kiev. Independent validation of HCC milestone VS-4.0. HCC source unchanged; no commits or PRs.

Report directory resolved from the supplied task and existing reports: `/mnt/d/AI/arch-validation`. Active workspace and all build dependencies, installations, consumers, fixtures, isolated child state and raw diagnostics remain on ext4 at **W** = `/home/nikita/arch-validation/vs-1.1b/vs-4`. `logs/` contains the earlier attempt; **`logs-current/` contains this execution's rerun**. Reports consolidate inspected earlier evidence with newly executed checks, identifying reused evidence below.

Ubuntu 22.04.4; WSL2 kernel `5.10.102.1-microsoft-standard-WSL2`; x86_64. Native Linux Node **24.22.2**, npm **11.19.1**, Git **2.34.1**, mise **2026.11.0**, Codex **0.166.0**. Controlled PATH excludes Windows mounts. Native executable provenance and ext4 mount are recorded in `logs-current/environment.json` and `processes.jsonl`. No Windows provider launcher was executed.

Exact required source **`b4c35238614e1df7dc696b05bb286ae6c34b2825`** successfully fetched from `https://github.com/Nickshajtan/hcc-harness.git` in this execution; HEAD and FETCH_HEAD match (`logs-current/fetch.json`, `sha.json`). The earlier DNS blocker is resolved. No newer revision substituted. Final source status is clean. Prior Claude WSL2 and Gemini/Codex/child Windows reports were consulted for test contracts, without treating Windows success as Linux evidence.

Independently installed Arch: `W/installed-offline/arch`, built using the supported `npm run install:stable -- --destination <absolute-path>` workflow. Reused installation logs: `logs/install-offline.txt`, `npm-ci-headers.txt`. Existing cached dependencies and Node headers were used; the earlier incomplete `W/installed` destination is unused. Current manifest verification checks **90 files, zero mismatches**, executable permission present (`logs-current/integrity.json`). Reused source-independence evidence: installed help and routed Codex version passed while the owned checkout was temporarily renamed and then restored (`logs/independent-*.json`). Reused synthetic hard-link inode/symlink-read checks pass (`logs/posix-links.json`). No filesystem stress campaign repeated.

## Authorized native installation

The user explicitly authorized another native Gemini installation attempt, superseding the task's earlier installation prohibition for Gemini. This attempt succeeded, npm exit **0**. Linux npm installed **Gemini CLI 0.67.0** into the isolated ext4 prefix `W/gemini-tools`, using `W/npm-cache`; no global provider or parent Codex installation/configuration was changed. Raw install log: `W/logs-current/gemini-install.txt`. npm reported optional keytar install scripts not approved; version/help checks work without changing script approvals. Authentication/keychain and interactive login behavior remain NOT TESTED.

The accepted native launcher is `W/gemini-tools/node_modules/.bin/gemini`, a POSIX symlink to `@google/gemini-cli/bundle/gemini.js`, executed by Linux Node 24.22.2 ELF. `logs-gemini/provenance.json` records actual command resolution, runtime, cwd and shell/tool PIDs. The Windows-mounted launcher is excluded. Diagnostics use synthetic `W/gemini-home` as HOME and GEMINI_CLI_HOME; no credentials were copied and no Gemini inference occurred.

The earlier missing-provider verdict is superseded by this successful installation and the actual tests below. The earlier DNS failure remains preserved as historical evidence, not a current blocker. Detailed new raw logs are under **`W/logs-gemini/`**.

## Native and routed CLI parity

| Command | Native exit | Routed exit | stdout | Provider stderr |
| --- | --- | --- | --- | --- |
| `gemini --version` | 0 | 0 | Exact; `0.67.0` | Exact |
| `gemini --help` | 0 | 0 | Exact | Exact |
| `gemini --vs4-invalid-option` | 1 | 1 | Exact | Exact |

`native-*.json`, `route-*.json` and `parity.json` retain arguments, cwd, stdout/stderr, status, PID and duration. Every comparison passes, with no timeout. Routed diagnostics enable Arch trace/demo middleware; provider-stderr parity removes only `[arch:event]` and `[arch:demo]` lines. Raw stderr is consequently different and is not claimed byte-identical. Baseline/parity calls do not use the Node observer; labelled observation runs do.

## Terminal → Arch → Gemini

`gemini-activation.mjs`, run by the current parent's Bash tool, drives a real interactive `/bin/bash --noprofile --norc -i` PTY. It evaluates `mise activate bash`, then exercises actual prompt activation:

1. Outside consumer: `command -v` and `type -a` select native `W/gemini-tools/node_modules/.bin/gemini`.
2. Enter `W/gemini-consumer`: both select `W/gemini-consumer/.arch/bin/gemini`.
3. Real version/help/invalid calls return **0/0/1**, with Arch execution events and provider output.
4. Leave: native resolution restored.
5. Re-enter: Arch selection restored, genuine version succeeds, shell remains usable.

Terminal evidence: `activation-extended.ansi`, `activation-extended-exit.json`, `terminal-driver.json`; PTY exit **0**. This is genuine interactive Bash/mise activation automated by the current parent, not an independently operated human terminal. Setup and deinit return 0 (`init.json`, `deinit.json`).

## Codex → Arch → Gemini

The active parent Codex invoked `gemini-current.py` via its actual Bash shell tool. A controlled noninteractive Bash in the consumer explicitly evaluates `mise activate bash` and `mise hook-env -s bash`, then uses ordinary `gemini --version` and `gemini --help`. Both return **0**, with output and Arch execution/completion events delivered back to this parent. `agent-route.json` records shell PID/PPID, cwd, `type -a`, actual command resolution and statuses. Routing was explicitly established inside the child tool shell; natural inheritance is not claimed.

Actual execution proof goes beyond PATH: separately observed real calls show installed Arch Node **PID 215 → genuine Gemini Node PID 228 → Gemini's own Node relaunch PID 236** for version; help uses **252 → 265 → 273** (`processes.jsonl`). All use native Linux Node and the actual installed Gemini bundle. PIDs are namespace-local to that tool invocation. The provider's own Node relaunch is not Arch recursion: it directly re-executes the Gemini bundle and appears after one Arch boundary. The consumer cwd, synthetic environment sentinel and isolated child-home setting survive through these processes. No environment or credential dump was made. Child CLI exit/output are returned to the parent; these commands perform no semantic task delegation.

## Signals, cleanup and provider isolation

Bounded genuine CLI startup tests send SIGINT/SIGTERM after 100 ms to native and Arch-routed `--help` processes. Native returns signal statuses **-2/-15**; routed returns conventional shell statuses **130/143**, with Arch finalize/cleanup events. All four complete without timeout (`signals.json`). This demonstrates startup cancellation and signal mapping, not mature authenticated TUI behavior. No uncontrolled TUI automation was used.

A separate observed real version invocation checks process presence after return in the same tool PID namespace: all recorded Arch/Gemini processes are gone (`cleanup.json`, `cleanup-processes.jsonl`). The check does not claim host-wide process visibility. Consumers are safely deinitialized; native installation is retained for future use. No fixture invocation is presented as real Gemini evidence. Shared synthetic transport and signal tests remain labelled in the Codex report.

All three genuine Linux provider routes pass version calls in a fresh multi-provider consumer: Claude, Gemini and Codex. Removing Gemini preserves both Claude and Codex routes and successful version output. Deinit preserves the foreign file and its inode. Evidence: `W/logs-gemini/multi-*.json`, `foreign.json`. All test routes were deinitialized. No cross-provider inference occurred.

## Focused regressions and limits

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


No new source change required a test rerun after the already passing focused regression. New provider validation uses actual Gemini rather than adding implementation-mirroring tests. HCC source remains clean (`logs-gemini/source-status.json`). Native optional keychain integration, authenticated TUI/long-running signal semantics and Gemini inference are NOT TESTED. Gemini semantic delegation is outside this milestone. The separate Codex restricted-read sandbox blocker is unaffected by installing Gemini.

## Verdict

**CONDITIONAL GO. Is Gemini correctly routed through Arch on WSL2? Yes for the tested Linux CLI process-routing configuration.** Both interactive terminal activation and current-Codex shell-tool invocation reach genuine Linux Gemini through the independent Arch installation, with native CLI parity, observed process ancestry, cwd/environment forwarding, startup signals, cleanup and three-provider isolation. Conditions are the explicitly untested mature TUI/authentication behavior; no unrestricted interactive or semantic support is claimed.
