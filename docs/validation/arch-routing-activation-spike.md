# Arch routing activation spike (macOS / Claude Code)

Status: investigation only. No production code, user config, or Claude files were changed.
Writer's note: this file was written into the review checkout (`b4c3523`, cwd of this session), not into the clean test clone, to keep that clone unmodified. Move it into the repo as needed.

## 1. Tested commit and environment

| Item                        | Value                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code read / run             | `69969af79f2631876919639a15b992050f02d316` (`~/arch-validation/macos-acc/src/hcc-harness`, clean, 0 modified files)                                       |
| Review checkout (this file) | `b4c35238614e1df7dc696b05bb286ae6c34b2825` (older; not used for experiments)                                                                              |
| macOS                       | 26.1 (25B78), arm64                                                                                                                                       |
| Claude Code                 | 2.1.319, `~/.local/bin/claude` -> symlink to `~/.local/share/claude/versions/2.1.319`                                                                     |
| Node                        | v22.22.3 (nvm, user PATH); Arch runs on private Node 24.19.0 via `ARCH_NODE`                                                                              |
| mise                        | not on the user's PATH; private 2026.10.11 at `~/arch-validation/vs-1.1c/tools/mise`                                                                      |
| Shell                       | zsh; the Bash tool runs `/bin/zsh -c "source <snapshot> ... && eval ..."`                                                                                 |
| Project                     | disposable `~/arch-validation/macos-acc/sub` (middleware = [], isolated mise dirs)                                                                        |
| Arch stable                 | `~/arch-validation/macos-acc/stable/arch-stable/arch`                                                                                                     |
| Activation                  | project `.config/mise/conf.d/arch.toml`: `_.path = ["{{config_root}}/.arch/bin"]`; launcher `.arch/bin/claude` is `exec <stable arch> run claude -- "$@"` |

No inference was run. The investigating agent's own environment and credentials were not touched.

## 2. Current routing activation design (code facts)

- Activation is **cooperative PATH precedence**: mise adds `.arch/bin` to PATH when active in the project (`src/installation/renderer.ts:17`).
- `nativeEnvironment()` (`src/process/native-environment.ts`) strips PATH entries that are Arch routers (dir containing `.arch-router`) before resolving and spawning the native executable. So the native child's PATH deliberately **does not contain `.arch/bin`**.
- `composeLaunchEnvironment()` (`src/core/execution-environment.ts`) only adds changes plus `ARCH_ACTIVE` / `ARCH_PARENT_EXECUTION_ID`; it does not touch PATH.
- `inspectInstallation` reports `shellActivation: 'unknown'` and states "PATH presence alone does not prove routing" (`src/lifecycle/inspection.ts:91`). Arch already documents this as non-guaranteed.

## 3. Observations

### 3.1 PATH at each boundary

| Boundary                                 | Observation                                                                                                                                                                                                             | Basis                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Host shell                               | `~/.zshrc` line 13 does `export PATH="$HOME/.local/bin:$PATH"` (after pyenv, lando). No arch/mise entries.                                                                                                              | observed (file read)                                               |
| Arch launch-time                         | Arch's input PATH is whatever the caller has; Arch removes router dirs for the child.                                                                                                                                   | code read                                                          |
| Native Claude child                      | Receives PATH without `.arch/bin` by design; `ARCH_ACTIVE` is propagated.                                                                                                                                               | code read + earlier acceptance (child Bash tool saw `ARCH_ACTIVE`) |
| Claude Bash tool                         | This agent's Bash tool PATH equals the parent claude process PATH for the first 6 entries (`ps -E` vs `echo $PATH`). Arch bin absent (this session was not Arch-launched). `command -v claude` = `~/.local/bin/claude`. | observed                                                           |
| Real child Claude's Bash tool under Arch | **Not re-observed** (needs paid inference). Earlier acceptance recorded plain `claude` bypassing Arch there.                                                                                                            | earlier report, not reproduced                                     |

### 3.2 Shell snapshot overwrites inherited PATH

Claude's Bash tool runs `zsh -c "source ~/.claude/shell-snapshots/snapshot-zsh-*.sh ..."`. The snapshot contains one literal `export PATH=...` line (line 4558 in the current snapshot), captured from an interactive-rc shell.

Experiment (inherited PATH = `<sub>/.arch/bin:$PATH`):

| Case                                                            | `command -v claude`                                  |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| plain `zsh -c`                                                  | `.arch/bin/claude` (Arch)                            |
| `zsh -lc`                                                       | `.arch/bin/claude` (Arch)                            |
| `bash -c`, `sh -c`                                              | `.arch/bin/claude` (Arch)                            |
| `zsh -c "source <real snapshot>"`                               | `~/.local/bin/claude` (**native**, `.arch/bin` gone) |
| same, with the snapshot's `export PATH=` line removed (control) | `.arch/bin/claude` (Arch)                            |
| `zsh -ic` (reads `~/.zshrc`)                                    | `~/.local/bin/claude` (**native**)                   |
| `zsh -lic`                                                      | `~/.local/bin/claude` (**native**)                   |

In the interactive cases `.arch/bin` survives at position 5/18 but `~/.local/bin` is re-prepended at position 1 by `~/.zshrc:13`, so it still wins.

### 3.3 Controlled matrix

| Scenario                                                       | Executable                       | Arch execution created | Events                      | Native launched | Notes                                              |
| -------------------------------------------------------------- | -------------------------------- | ---------------------- | --------------------------- | --------------- | -------------------------------------------------- |
| S1 native from normal shell                                    | `~/.local/bin/claude`            | no                     | none                        | yes             | baseline                                           |
| S5 explicit `.arch/bin/claude`                                 | launcher -> stable arch          | yes (`7e0f6ced-...`)   | started, completed (exit 0) | yes             | positive control, ARCH_TRACE=1                     |
| S4 `mise exec -- claude`                                       | `.arch/bin/claude` first in PATH | yes (`8b2ced53-...`)   | started, completed          | yes             | project PATH entry works under mise                |
| Controlled PATH prepend, `zsh -c claude`                       | `.arch/bin/claude`               | yes                    | started, completed          | yes             | inheritance works if nothing rewrites PATH         |
| Controlled PATH prepend, node `spawnSync("claude")` (no shell) | Arch                             | yes                    | 2 events                    | yes             | PATH lookup without shell honors the prepend       |
| Absolute `~/.local/bin/claude` with Arch PATH                  | native                           | no                     | 0 events                    | yes             | explicit bypass                                    |
| Plain `claude` via snapshot-sourced zsh                        | native                           | no                     | n/a                         | yes             | the observed bypass, reproduced at the shell layer |
| Arch-routed Claude, real Bash tool                             | not observed                     | -                      | -                           | -               | unavailable without inference                      |

Not tested separately: "Arch-routed Claude with normal activation" as a live TUI/`-p` run (no inference). The shell-layer reproduction above stands in for it and is **not** a substitute for a real tool run.

Side effects of the PATH prepend: `node`, `git`, `python3`, `mise` resolve identically with and without `.arch/bin` (it only shadows commands that have a launcher). Nested launcher call through a prepended PATH produced a fresh `executionId`, consistent with the F3 fix in `d028df2+`.

## 4. Root cause (best-supported)

Observed facts:

1. Arch intentionally removes `.arch/bin` from the native child's PATH.
2. Claude Code's Bash tool builds its shell from a snapshot with a hard-coded `export PATH=`, which replaces any inherited PATH.
3. The user's `~/.zshrc` re-prepends `~/.local/bin` (where native `claude` lives), which shadows `.arch/bin` even when it is preserved.

Hypothesis (not directly observed): in a real Arch-launched Claude, the snapshot is captured from an interactive shell started with a PATH lacking `.arch/bin`, because Arch stripped it and mise is not activated in `.zshrc`. This matches the earlier acceptance observation but was not re-run.

So: the boundary that loses the routing PATH is **Arch's own child-environment sanitising first, then the provider shell snapshot/user rc files**. It is an interaction of Arch (by design), Claude Code (snapshot) and user shell config, not a Core lifecycle defect.

## 5. Bypass classification

| Case                                               | Result                                          | Class                        |
| -------------------------------------------------- | ----------------------------------------------- | ---------------------------- |
| Plain `claude`, `.arch/bin` absent or shadowed     | native                                          | cooperative routing failure  |
| Absolute native path                               | native                                          | explicit native bypass       |
| Alternative PATH precedence (`~/.local/bin` first) | native                                          | cooperative failure / config |
| `sh -c claude`                                     | follows PATH of that shell                      | same as above                |
| Provider executes binary directly without shell    | PATH lookup of inherited env; no Arch if absent | cooperative failure          |
| Built-in Claude subagents                          | in-process, not a process launch                | out of scope                 |

PATH precedence is not a security boundary. Anything that can run a process can run the native binary by absolute path.

## 6. Options

|                        | A Explicit only | B Inherited env (Arch prepends `.arch/bin` to child)                                                   | C Provider adapter                         | D OS enforcement |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------- |
| Fixes Bash-tool bypass | no              | **no on this machine**: snapshot `export PATH=` and `.zshrc:13` defeat it                              | likely yes, via documented hooks/settings  | yes              |
| Persistent config      | none            | none                                                                                                   | yes (settings/hooks) unless session-scoped | system-level     |
| Recursion risk         | none            | real: native-env stripping exists precisely because the router can appear in native lookup; needs care | low                                        | n/a              |
| Side effects           | none            | shadows only commands with launchers                                                                   | provider-version dependent                 | high             |
| Multi-project          | fine            | fine                                                                                                   | needs per-project config                   | fine             |
| Fails visibly          | n/a             | no, silent when shadowed                                                                               | can                                        | yes              |

B is cheap to prototype but, by the evidence here, would not change the outcome for this user's environment, and it would reverse the deliberate stripping in `nativeEnvironment`. D is a separate category (needs OS interception / sandbox); PATH manipulation cannot provide it.

A hook-based provider adapter (earlier `guard.py` experiment) redirected bare `claude` but the acceptance report found many bypasses and false positives; the task scope also excludes regex guards.

## 7. Recommendation

**NO CHANGE** to Core, plus a documentation contract:

- Arch guarantees routing for explicit invocation: `.arch/bin/<cmd>` or `mise exec -- <cmd>`.
- Plain `<cmd>` inside provider shells is best-effort and depends on mise activation, shell rc ordering and provider PATH handling.
- Not a security boundary.

Optional later: **OPTIONAL PROVIDER ADAPTER** only if a documented, session- or project-scoped Claude mechanism is confirmed (not verified here), opt-in, failing visibly.

Doing nothing is technically reasonable: the explicit contract is already stated in `inspection.ts` and the wizard text.

## 8. Answers to decision questions

1. Lost at: Arch's stripped child PATH, then Claude's snapshot `export PATH=` / `~/.zshrc` ordering.
2. Interaction of all three; Arch's part is intentional.
3. Launch-time composition alone: no, on this machine.
4. Not demonstrated; the snapshot-source experiment says it would not.
5. Only for convenience, not correctness.
6. Not reliably, without touching user settings or shell rc.
7. Absolute paths, direct exec with explicit paths, shadowed PATH, in-process subagents.
8. "Explicit invocation is routed; implicit is best-effort."
9. Documentation of the contract. Nothing else required.
10. Yes.

## 9. Confidence and unresolved

- Confidence: high on the shell-layer mechanics (reproduced); medium on the real Arch-launched Claude Bash tool (not re-observed).
- Unresolved: actual PATH in a real Arch-launched Claude Bash tool; whether Claude has a documented env/PATH setting for its Bash tool (not checked); behavior with mise activated in `.zshrc` (mise not installed on user PATH, so untested); Claude version dependence of the snapshot mechanism.
- Facts vs hypotheses are labelled in sections 3 and 4; sections 6-7 are architectural judgement.
