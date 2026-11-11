# VS-1.1b — Ubuntu WSL2 Linux-native Claude consumer validation

Executed 2026-11-05 (Europe/Kiev). Validation only; no production edits, commits, PRs, Windows installation changes or paid inference.

## Executive judgment

**Environment readiness: PASS. CONDITIONAL GO for the measured Linux-native CLI, lifecycle and mise workflow. Full interactive acceptance: NOT ESTABLISHED.** Independently installed Linux Arch reliably routed real Linux Claude in the bounded CLI tests on verified ext4. Ownership, interrupted routing recovery, independent runtime, transport and fixture signal checks passed. The authenticated Claude prompt, normal `/exit`, and idle Ctrl+C return to a usable shell are not accepted: this fresh Claude installation reaches onboarding, and direct as well as routed onboarding does not settle after the tested Ctrl+C sequences. Explicit termination settles both paths. This is not a confirmed Arch-specific defect and does not justify attributing historical Windows incidents to Linux.

The answer to the full requested question is therefore **qualified**: yes for native CLI routing, lifecycle safety and genuine mise activation; **not yet demonstrated for the complete interactive/process behavior requirement**. Do not advertise unrestricted WSL2 TUI support from this report.

## Prior attempt and provenance

The requested `wsl-task.md` was absent. The specification and continuation were found in `/mnt/d/AI/arch-validation/wsk-task.md` and executed. The canonical reporting directory is `/mnt/d/AI/arch-validation`; the session actually began in the separate Linux workspace. The continuation explicitly names this report destination and takes precedence over the older wording about launch location.

No preexisting `claude-code-vs1-wsl2.md` was available to append. The task states that an earlier attempt was environment-blocked by read-only home and unavailable outbound networking. That historical **NOT TESTED** classification is retained here as supplied task history, not independently recovered evidence or an Arch failure. This retry proves network access and permitted ext4 writes; home directories outside authorized roots remain read-only inside the sandbox.

Read the available VS-1, VS-1R and VS-1.1a reports from the three Windows validation checkouts under `docs/validation/`. Their combined text is retained in `logs/prior-reports.md`. No prior findings are erased or upgraded.

Fresh command: `git clone --branch main --single-branch https://github.com/Nickshajtan/hcc-harness.git source`.

- SHA: **`b4c35238614e1df7dc696b05bb286ae6c34b2825`**.
- Branch: `main`, tracking `origin/main`; final `git status --short --branch` shows no changes.
- FS-1.2 and durable setup-claim contracts are present in `docs/fs-1.2-native-publication.md`, setup-claim implementation and tests. POSIX publication remains hard-link based; Windows native no-replace publication is a separate platform path.
- No feature branch substitution, npm link, source edit, credential copying, global profile edit or source commit.

## Environment and filesystem proof

Raw inventory: `logs/inventory.json`. Evidence workspace (**W**) is `/home/nikita/arch-validation/vs-1.1b`. Paths below are relative to W unless otherwise stated.

| Component                       | Observed                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Distribution                    | Ubuntu 22.04.4 LTS, Jammy                                                                                     |
| Kernel                          | `5.10.102.1-microsoft-standard-WSL2`, x86_64                                                                  |
| WSL version                     | WSL2 established by kernel; Windows WSL package version NOT TESTED, no Windows executable substituted         |
| Consumer filesystem             | `findmnt -T .`: `/dev/sdb[/home/nikita/arch-validation/vs-1.1b]`, **ext4**, writable                          |
| Mount options                   | `rw,nosuid,nodev,relatime,discard,errors=remount-ro,data=ordered`                                             |
| Secondary filesystem identifier | `stat -f` says `ext2/ext3` (shared filesystem magic); ext4 claim comes from mount inventory                   |
| Report filesystem               | `findmnt`: 9p, `aname=drvfs;path=D:\`, rw; read-only inspection plus final report write only                  |
| Node / npm                      | Linux Node `v24.22.2`, npm `11.19.1`; repository requires Node >=24.15.0 <25                                  |
| Git                             | Linux `2.34.1`                                                                                                |
| mise                            | Linux `2026.11.0 linux-x64`                                                                                   |
| Claude                          | Linux-native `2.1.318`, locally installed `@anthropic-ai/claude-code`                                         |
| Codex                           | Linux CLI `0.166.0`; warning about unavailable home PATH-alias writes retained                                |
| Compiler/interpreter tools      | Existing `/usr/bin/g++`, make, Python 3.10.12; no apt/sudo operation                                          |
| Terminal                        | Controlled Linux node-pty, Bash 5.1, TERM=xterm-256color; not proof of a particular Windows GUI terminal host |

A write probe passed in W before installation. Actual Codex shell HTTPS requests to GitHub and registry.npmjs.org returned HTTP 200. Fresh cloning and npm downloads succeeded. Node, mise, Git, Bash and Claude were checked with `file` or `/proc/.../exe`. Node/mise/Claude are Linux ELF x86-64 executables. Arch and project launchers are executable POSIX shell scripts with Linux interpreters. Claude's npm package internally calls its Linux ELF file `bin/claude.exe`; the suffix is **not** Windows executable evidence. `/proc` confirms that exact ELF in the routed process tree.

Sandbox: writes permitted in W, the reporting root and /tmp; protected .git/.agents/.codex/.aws mounts and other home locations are read-only; network enabled. Windows PATH entries existed in the inherited host environment, but the accepted mise/PTTY diagnostics use a controlled Linux-only PATH. No Windows Node/mise/Arch/Claude executable was used. W contains source, caches, installation, fixtures and raw logs on ext4.

## Build, dependencies and independent installation

Requirements were read in README, usage, runtime/publication contracts and repository quality gates. Existing valid tooling was reused. Claude was installed only under `tools/` with an owned npm cache; no global CLI installation or authentication change.

Commands:

```sh
npm ci --prefix source --cache "$W/npm-cache"
# First attempt failed at node-gyp's default read-only home cache.
npm ci --prefix source --cache "$W/npm-cache" --devdir="$W/node-gyp-cache"
cd "$W/source"
npm_config_cache="$W/npm-cache" npm run install:stable -- --destination "$W/installed-clean"
```

Dependency retry and the initial installer retry received permission escalation after sandbox write failures. No sudo or unrelated system changes were needed. npm warned that `--devdir` is an unknown CLI configuration (currently forwarded), and reported **13 moderate dependency vulnerabilities**; dependencies were not upgraded or audit-fixed in this validation.

The first installation failed because its npm subprocess used read-only `~/.npm`. It retained `installed/`. Retrying that reserved destination correctly failed EEXIST. Both failed logs and the failed destination remain. A fresh `installed-clean/` with an explicit owned npm cache passed the supported preinstall build, bootstrap build and installer. This is environment preparation, not a repaired product defect.

`installed-clean/installation.json`: kind `arch-stable-installation-v1`, platform `linux`; **90/90 recorded resource hashes match**. Ready marker exists. Arch/launcher executable modes and publication mode 0755 were verified; symlink safety was tested separately. `logs/integrity.json` records every hashed file and mode.

The entire `source/` directory was reversibly renamed to `source-isolated/`; installed routed Claude `--version` still passed, then source was restored. Generated launchers target the independent installation. Runtime execution does not use source node_modules, npm link or Windows package caches. Failed artifacts remain retained.

## Lifecycle, recovery and ownership

Driver: `validate.mjs`; commands/streams/status/PIDs in `logs/consumer.json`, checkpoint in `logs/interruption.json`.

| Transition                                       | Result                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Initial `arch init claude`, JSON status          | PASS; initialized, owned resources valid                                                                                            |
| `.arch/setup-claim` removed after success        | PASS, checked filesystem absence                                                                                                    |
| Repeated identical init                          | PASS                                                                                                                                |
| Add codex / remove codex                         | PASS                                                                                                                                |
| Controlled interruption                          | PASS: installed lifecycle API reached persisted `published:.arch/bin/codex` checkpoint, then only the owned worker received SIGKILL |
| Pending journal status                           | PASS; recovery pending observed before recovery                                                                                     |
| `configure claude codex`, remove recovered codex | PASS; journal recovery completes                                                                                                    |
| Foreign file collision                           | PASS; add refused with exit 1, original inode and bytes preserved through deinit                                                    |
| Foreign symlink to `/bin/true`                   | PASS; route add refused with exit 1                                                                                                 |
| Deinit and clean reinit                          | PASS                                                                                                                                |
| Final state                                      | Initialized; Claude and owned diagnostic vsprobe routes, no pending recovery                                                        |

The interruption uses `source/tests/fixtures/routing-worker.mjs` as a driver importing **installed** lifecycle code. IPC acknowledges the actual persisted checkpoint; there is no guessed race or hand-written journal. No ambiguous setup claim was manually cleared. The ordinary suite covers durable setup authority, publication boundaries, ownership, routing journals and fail-closed recovery. Source-independent execution was separate from the mutation sequence.

POSIX probe `publication.mjs` calls installed `publishExclusive` against a completed 1 MiB stage. Concurrent reads observed only ENOENT or complete expected bytes. Stage and target had the same inode, link count 2, mode 0755. Publishing onto the existing target failed EEXIST without replacement; unlinking the stage retained complete target bytes. These are bounded individual-file observations, not atomic route-set or power-loss guarantees. No Windows rename behavior was inserted. Evidence: `logs/publication.json`, retained `publication-fixture/`.

## Real Claude parity and deterministic transport

Real baseline precedes setup. Each operation has a 20-second timeout, captured streams, cwd, PID, termination status and duration.

| Check                               | Direct native      | Installed launcher                       | Judgment                                                      |
| ----------------------------------- | ------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| `--version`                         | 0, 2.1.318         | 0, same stdout                           | PASS                                                          |
| `--help`                            | 0                  | 0, byte-identical stdout                 | PASS                                                          |
| `--vs1-invalid`                     | 1                  | 1, same stdout, native error retained    | PASS                                                          |
| Extra stderr                        | Native diagnostics | Arch trace/demo lifecycle messages added | Expected middleware behavior, not byte-identical stderr claim |
| Exact argv/empty/quotes/Unicode     | Fixture            | Fixture                                  | PASS, separate from real Claude proof                         |
| stdin/stdout/stderr/cwd/environment | Fixture            | Fixture                                  | PASS                                                          |
| Exit 7                              | Fixture 7          | Fixture 7                                | PASS                                                          |

`transport.mjs` creates an executable Linux Node fixture. Exact tested argv: spaced string, Ukrainian text, empty argument, embedded single/double quotes, literal `$HOME`, `/tmp/path`. Both paths produce identical JSON for argv, project cwd, harmless sentinel and stdin, identical stderr and exit 7. Real Claude does not expose these exact transport values; fixture success is not substituted for real provider execution. No inference was requested.

Routed real executions emit one Arch execution-start event for the correct consumer and complete once. Native ELF process identity was observed beneath Arch's Linux Node in the PTY diagnostic. Routing does not recurse through its own launcher.

## Genuine Linux mise activation

The first harness inherited host `__MISE_*` state and an original PATH. Its hook executions returned native Claude first even though `.arch/bin` appeared later; these are **INVALID activation evidence**, not accepted routed repetitions. Its separate `mise exec` also failed when a host Node shim was selected against isolated mise data. Raw results remain in `logs/consumer.json` and `logs/activation-pty.ansi`.

Corrected harness `activation-clean.mjs` removes inherited `__MISE_*`/MISE_SHELL state, sets a Linux-only PATH with native Claude, Linux Node, Linux mise and standard Linux utilities, and uses isolated mise cache/data/state/config directories. It initializes supported Bash integration with `eval "$(mise activate bash)"`. It does not manually insert `.arch/bin` into PATH.

Generated config was trusted explicitly. A real interactive Bash PTY then proved:

1. Outside project, `command -v` and `type -a` select native Claude.
2. Enter project, refresh prompt: project launcher is selected first; actual execution emits Arch trace and real version.
3. Five separate interactive version invocations return 0 with five start/completion pairs.
4. Leave: native resolution restored.
5. Reenter: project launcher selected, real execution traced again.
6. Shell remains usable and exits 0.

Evidence: `logs/activation-pty-clean.ansi`, exit JSON, selected PATH and `stty size` 32×110. Six execution-start events correspond to five repetitions plus reentry. `mise-exec.mjs` separately proves clean-environment `mise exec -- claude --version`, exit 0 and actual Arch trace (`logs/mise-exec-clean.json`). Inherited-state failures were not silently retried or counted as passes. No PATH-duplication guarantee beyond these bounded transitions is claimed.

## Interactive TUI, cancellation and process lifetime

**PARTIAL / FAIL for measured onboarding cancellation settlement; authenticated interactive acceptance NOT TESTED.** Direct and routed native Claude both render the theme selector in a real Linux PTY. Arrow input changes selection/theme. Resizing 110×32 to 92×28 causes narrower redraw. Selecting a theme reaches the login-method screen; no credentials were supplied, no login was completed, and no model prompt was submitted. One exploratory driver sent later shell text before proving cancellation had returned, which advanced login UI; it is not shell-return evidence. Any emitted OAuth URLs in those exploratory raw captures were redacted.

Idle Ctrl+C shows the native “press Ctrl-C again” response and terminal reset sequences, but tested pairs do not return a shell prompt within the bounded wait. Early PTY drivers eventually used HUP and therefore do **not** establish normal exit or cleanup. Retained failed transcripts: `logs/pty-initial.ansi`, `logs/tui-*.ansi`, `logs/tui-cancel-*.ansi` and JSON.

A separate bounded `tui-diagnostic.mjs` records `/proc` process identity before/after cancellation without guessing from terminal reset output:

- Direct: Bash → native Linux Claude remains sleeping after Ctrl+C.
- Routed: Bash → Linux Node/Arch → same native Linux Claude remains sleeping after Ctrl+C.
- Only recorded owned descendants are then sent SIGTERM. Arch emits finalize/cleanup and exit 143; Bash prints `AFTER_TERMINATION` and exits 0.
- Final scan of recorded PIDs finds no remaining process in either diagnostic. Raw PID/process records: `logs/tui-diagnostic.json`. PIDs are sandbox namespace observations, not global host PID claims.

Thus startup/rendering/input/resize pass in the observed onboarding subset; normal `/exit`, authenticated project trust flow and idle-Ctrl+C return are not accepted. Native reproduction shows Arch is not necessary for this failure. Exact cause (Claude version, onboarding state, PTY interaction or host environment) remains unresolved. No global process-name killing was used.

Fixture signal tests are separate and pass: direct native Node dies by SIGINT/SIGTERM; routed Arch returns 130/143 and the recorded native child is absent after close. Exact process records are in `logs/transport.json`. These prove supported direct-child signal behavior, not arbitrary descendant containment or successful Claude TUI cancellation. Forced parent SIGKILL cleanup guarantees and active-inference cancellation are NOT TESTED.

## Bounded reliability

No retry-until-success. Real direct and explicit-launcher repetitions are five independent processes each, fixed 20-second timeouts, all stdout/version/status/closure captured. Accepted automatic activation attempts are five commands in the clean interactive Bash session, each bounded by the PTY driver's 20-second command deadline. They are distinct real Claude executions with trace, not five independent shell startups.

| Attempt | Direct ms / code | Launcher ms / code | Clean interactive mise               |
| ------- | ---------------- | ------------------ | ------------------------------------ |
| 1       | 20 / 0           | 206 / 0            | exit 0, real version, one Arch start |
| 2       | 9 / 0            | 277 / 0            | exit 0, real version, one Arch start |
| 3       | 10 / 0           | 285 / 0            | exit 0, real version, one Arch start |
| 4       | 9 / 0            | 211 / 0            | exit 0, real version, one Arch start |
| 5       | 10 / 0           | 191 / 0            | exit 0, real version, one Arch start |

CLI acceptance: **15/15**, no timeout or unexplained CLI residue. The five inherited-state hook attempts are explicitly excluded. The TUI settlement failures remain failures, not included in the CLI success count. No Windows exFAT causal explanation is inferred.

## Repository checks

- `npm run check`: format, typecheck, lint, zero-warning baseline, 24 quality-tooling checks, dependency rules (62 modules/173 dependencies), build/bootstrap passed. First ordinary test run: **724 passed, 75 skipped, one failed suite**, stable-runtime setup failed due read-only default npm cache. This command as a whole is **FAIL (environment)**, not a green check.
- Focused corrected `npm test -- tests/integration/stable-runtime.test.ts`: **8 passed** with owned npm cache.
- Complete corrected `npm test -- --reporter=default --reporter=json --outputFile=...`: **732 passed, 67 skipped, 0 failed**; 48 passed files, six fully skipped. It includes publication/setup-claim/authority/ownership/routing recovery, stable interruption/runtime, native lifetime/process, npm transport and platform contracts. All original assertions/thresholds retained.
- `npm run test:acceptance`: **1 passed**.
- `npm run test:wizard`: **76 passed**, plus real-stdin/stdout-TTY terminal check PASS.
- `node summarize.mjs`: PASS for real parity, route traces, stream fixture identity, signal settlement, publication observations, interactive attempt counts and separate mise exec.
- `node inspect.mjs`: **90/90 hashes match**.
- Final source `git status`: clean main. No CI results inspected or inferred.

Skipped assertions are enumerated individually in `logs/skipped.json`, with full suite records in `logs/tests.json`. Skips include opt-in Node22/runtime feasibility and Windows-only publication/process behavior across runtime-bootstrap, runtime-contract, native-publication, npm-runtime, process, publication-consumer, setup-authority/setup-publication, uninstall-stability, resolution and stable-effects files. Skips are **NOT TESTED**, not Linux passes. Expensive mutation, new coverage measurement, cross-platform CI, additional real Node versions and Windows interop lifecycle were NOT TESTED. The final ordinary suite rerun was justified by the corrected npm cache, not arbitrary repetition of product failures.

## Comparison and remaining limits

VS-1 established historical paid-inference/edit and explicit Windows routing on an approved feature snapshot; it lacked current-main and real mise evidence. VS-1R verified this same upstream SHA, Windows NTFS installation and NTFS/exFAT consumer behavior, with unresolved Windows lifetime/sharing incidents. VS-1.1a conditionally accepted Windows-native Git Bash CLI/ConPTY, retaining interactive mise PATH growth, where.exe discrepancy and terminal-host gaps. Their exact classifications and three historical inference calls remain historical only.

This slice adds actual Ubuntu processes, Linux ELF Claude, ext4 hard links, native POSIX signals and supported Linux mise activation. There is no MSYS argument conversion, Windows publication helper or NTFS-installation dependency in the accepted Linux path. It does not resolve Windows incidents, Linux onboarding cancellation, or the Git Bash PATH/terminal findings. Claude versions differ (prior Windows 2.1.280 versus Linux 2.1.318), so platform-only causation cannot be inferred.

| Gate                       | Verdict                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A Native Ubuntu execution  | PASS                                                                                                                                  |
| B Linux filesystem         | PASS, ext4 verified                                                                                                                   |
| C Independent installation | PASS, hashes and reversible source isolation                                                                                          |
| D Genuine mise activation  | PASS for controlled fresh Bash environment; inherited-state harness failures retained                                                 |
| E Claude CLI parity        | PASS non-inference CLI and separate deterministic transport                                                                           |
| F Lifecycle/ownership      | PASS measured lifecycle, recovery and POSIX publication                                                                               |
| G Interactive runtime      | PARTIAL; onboarding rendering/input/resize pass; cancellation settlement FAIL in both paths; normal/authenticated workflow NOT TESTED |
| H Reliability              | PASS bounded CLI; PARTIAL overall because TUI settlement requires termination                                                         |
| I Evidence                 | PASS with explicit environmental/harness failures, skips and limitations                                                              |

**Confirmed Arch product defects: none established.** Outstanding: diagnose native/routed onboarding Ctrl+C settlement; authenticate Linux Claude only through an explicitly authorized interactive login to complete project trust, idle cancellation, `/exit` and prompt return; establish actual GUI terminal host if required. No inference budget is needed for those idle checks. No destructive or security-sensitive workaround was attempted.

Next step: close this Linux Claude interactive gap on the same installation and a real user terminal before claiming full WSL2 acceptance. After that, a separate Linux-native Codex consumer slice on ext4 is appropriate, with its own provider identity, non-inference CLI/TUI/signal and mise evidence. Do not broaden into DrvFs or close historical Windows reliability work from these results.

## Retained evidence and reproduction

Everything except this report remains under W. Primary scripts: `validate.mjs`, `transport.mjs`, `publication.mjs`, `activation-clean.mjs`, `mise-exec.mjs`, `tui-diagnostic.mjs`, `inspect.mjs`, `summarize.mjs`. All meaningful commands, cwd, captured output and per-attempt status are retained in logs. `validate.mjs` and publication fixture creation assume fresh owned fixtures; do not blindly rerun over retained evidence. Build/fixture sources and both installation destinations remain for inspection. No evidence fixtures were deleted to conceal a failure.

Reproduce in a new disposable ext4 workspace, clone the stated SHA, set npm cache explicitly, run the documented stable install into a nonexistent destination, create a fresh consumer, trust its generated mise config, and use a fresh Bash with Linux-only PATH and no inherited `__MISE_*` state. Scripts record the exact additional commands and checkpoint mechanics. TUI testing must not submit a prompt or accept billing; terminate only identified owned PIDs after recording a bounded failure.
