# Arch WSL2 control acceptance

Date: 2026-11-07. **Verdict: GO** for this targeted Ubuntu WSL2 acceptance.
No reproducible product defect or unexplained persistent Arch-owned process was
found. This verdict covers routing, native process behavior, nested execution,
stable installation and ownership; it does not certify model inference.

## Source and environment

- Repository: `Nickshajtan/hcc-harness`.
- Exact tested commit: `d028df2d4d76da17bc730234a866316449c04d53`.
  `git fetch origin` followed by `git merge --ff-only origin/main` confirmed
  `Merge pull request #24 from Nickshajtan/fix/arch-f1-f5-stabilization`.
- Checkout: `/home/nikita/arch-validation/vs-1.1b/source`; working tree clean
  before and after updating, before adding this report.
- Ubuntu 22.04.4 LTS, x86_64; kernel
  `5.10.102.1-microsoft-standard-WSL2`, Microsoft build dated 2022-03-02.
  `/proc/version` and the normal WSL process table confirm real WSL2.
- Primary checkout and retained installation: Linux ext4 on `/dev/sdb`, mounted
  `rw,nosuid,nodev,relatime,discard,errors=remount-ro,data=ordered`.
  Existing subprocess fixtures also used Linux `/tmp`.
- Node `v24.22.2`; npm `11.19.1`; Bash `5.1.16(1)-release`;
  mise `2026.11.0 linux-x64`. Installed launcher and native shell fixture modes
  were `0755`; executable and symlink operations worked.
- Task instructions were read from `/mnt/d/AI/arch-validation/wsl-task-3.md`.
  That mount is `9p`/DrvFS, not equivalent to ext4. No primary acceptance run
  used it. The incoming PATH's Gemini entry was Windows-mounted; the smoke
  tests explicitly selected the already installed Linux CLI below.
- Read the repository agent instructions, architecture, compatibility, runtime
  portability, F1–F5 stabilization record, nested-execution decision, usage signal
  contract, and standards for testing, determinism and quality gates.

Execution came from a Linux Codex agent inside WSL with an outer filesystem,
seccomp and PID sandbox, rather than a manually operated Windows terminal.
Actual kernel process groups and controlling POSIX PTYs were exercised. The
stable-runtime rerun and final host process-table inspections ran outside that
sandbox with explicit authorization. No isolation settings were changed.

## Commands and existing tests

From the checkout:

```sh
git fetch origin
git merge --ff-only origin/main
npm run build
npm run build:bootstrap
npm exec -- vitest run tests/integration/stabilization.test.ts tests/integration/stable-runtime.test.ts tests/integration/stable-interruption.test.ts --reporter=json --outputFile=/tmp/arch-wsl-focused.json
npm exec -- vitest run tests/integration/stable-runtime.test.ts --reporter=json --outputFile=/tmp/arch-wsl-stable.json
npm exec -- vitest run tests/unit/resolution.test.ts tests/integration/process.test.ts --reporter=json --outputFile=/tmp/arch-wsl-routing.json
```

| Selection                                   | Result                                                     |
| ------------------------------------------- | ---------------------------------------------------------- |
| Build and POSIX bootstrap build             | PASS                                                       |
| Stabilization integration                   | PASS, 11 tests                                             |
| Stable interruption                         | PASS, 4 tests: reserved, materialized, verified, published |
| Stable runtime, authorized normal WSL rerun | PASS, 8 tests                                              |
| Process integration                         | PASS, 15 tests; 3 Windows-only skips                       |
| Executable resolution                       | PASS, 51 tests                                             |

Final completed selection: **89 passed, 3 platform skips**. JSON assertion records
were inspected, including suite-level messages. The three skips were npm `.cmd`
resolution, Windows Ctrl+C/Ctrl+Break, and Windows PATHEXT/case-insensitive keys.
No full regression, mutation, historical matrix or other-platform suite was run.

The first combined command exited 1: its stable-runtime setup could not write
`/home/nikita/.npm/_cacache/tmp` (`EROFS`). Its other 15 tests passed, while all
8 stable-runtime assertions were unexecuted after the setup error. This was an
outer permission boundary, not a passing suite or demonstrated product failure.
Only that affected suite was repeated outside the sandbox; all 8 then passed.

## Independent stable installation and routing

Installed an additional disposable runtime with:

```sh
npm run install:stable -- --destination /home/nikita/arch-validation/vs-1.1b/wsl-control/runtime
```

The installed entry was used directly for supplemental checks, not the development
CLI. Its production dependency snapshot and completion publication succeeded.
Existing stable-runtime tests independently built another snapshot, routed native
fixtures with empty/quoted/Unicode arguments, preserved cwd/environment/stdin and
both output streams, and propagated exit 7. They relocated their copied source,
removed the historical Arch Node and selected a replacement runtime; installed
help and routes continued to work. The main user checkout was not relocated.

PASS: first eligible PATH Node, explicit runtime validation without fallback,
canonical runtime symlink acceptance, bootstrap-alias recursion refusal, installed
resource hashes, occupied-destination refusal, safe project deinitialization and
preservation of user files/custom middleware. The optional incompatible Node 22
branch was not provisioned; invalid/missing/relative runtime overrides were tested.

Supplemental installed-runtime checks passed:

- Real `mise exec -- probe active` activated the project route and emitted Arch
  events; after deinit, `mise exec -- probe inactive` was native with no events.
  mise data/cache/state/config and trust scope were disposable and project-local.
- Relative PATH entries, native symlinks, and foreign shell wrappers with relative
  `./target` versus absolute target operands preserved arguments, cwd, stdin,
  stdout/stderr and exit 7 against a direct-native comparison.
- `arch run` accepts executable names: both relative and absolute path operands
  were explicitly rejected with `Expected an executable name without paths`.
  Absolute native invocation remains the documented direct-native bypass.
- Existing resolution tests rejected generated launchers, wrapper cycles and
  stable Arch identities, while preserving unrelated native wrappers and symlinks.

## F1 signal matrix

Supplemental checks used the installed entry, actual process groups, and a native
Node fixture with readiness and counted signal handlers. Each direct-child PID
was checked absent after settlement.

| Case                         | Observed result                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Foreground/group SIGINT      | PASS: one handler invocation per signal; normal child exit 0 propagated                                                |
| Repeated Ctrl+C/group SIGINT | PASS: child remained alive beyond 3.3 seconds after first signal; exactly two invocations after two signals            |
| Native unhandled SIGINT      | PASS: existing test observed Arch termination by SIGINT after cleanup, equivalent to shell status 130                  |
| Nested group SIGINT          | PASS: existing nested fixture propagated 130, two signals at each native level, independent finalizers/cleanup         |
| SIGINT only to wrapper PID   | PASS: no child SIGINT output and wrapper/child remained active; subsequent wrapper SIGTERM completed cleanly           |
| SIGTERM only to wrapper PID  | PASS: child received exactly one SIGTERM, wrapper exited 143; finalize and cleanup once                                |
| SIGHUP only to wrapper PID   | PASS: child received exactly one SIGHUP, wrapper exited 129; finalize and cleanup once                                 |
| Actual PTY Ctrl+C            | PASS: existing foreground fixture handled exactly one terminal-generated SIGINT and remained active beyond 3.3 seconds |

No duplicate SIGINT, premature cancellation, SIGINT escalation or unbounded wait
was observed. Group injection used `killpg`; the separate PTY checks wrote byte
`0x03` to the terminal master, exercising the terminal line discipline. These are
separate from PID-targeted delivery. SIGTERM/SIGHUP fixtures settled promptly;
the documented three-second forced-kill deadline was inspected, not unnecessarily
waited through with an intentionally unresponsive child.

## F3 nested execution

PASS for `Arch A → native A → Arch B → native B → Arch C → native leaf`, both
exit 0 and controlled exit 17. Existing tests and supplemental installed-runtime
runs checked three unique execution IDs, immediate-parent IDs, reverse completion
order, all three middleware phases per invocation and three independent cleanup
calls. These observations exercise independent event and middleware lifecycles.
Inherited `ARCH_ACTIVE` did not reject or bypass nested invocations.

A supplemental inner invocation with `ARCH_DEMO_DENY=1` exited 1 without reaching
its native `BYPASSED` marker; inner and outer cleanup each ran. The existing
forged-valid-parent test independently proved correlation does not bypass denial.
Malformed parent correlation was ignored. Actual launcher recursion was refused
by identity tests; no arbitrary agent ancestry limit was added.

## PTY and interactive shell

PASS: the installed runtime launched `bash --noprofile --norc -i` in a real
controlling POSIX PTY. An INT trap handled terminal Ctrl+C, the shell continued,
and a foreground probe printed `os.getpgrp() == os.tcgetpgrp(0)` as true.
`exit 0` returned cleanly. The outer PTY driver compared `tcgetattr(0)` before and
after Arch and printed `RESTORED:True:CODE:0`; the driver was reaped and master
closed. This separately checks driver, Arch and native shell settlement.

One first supplemental driver attempt timed out because its output matcher
expected CRLF immediately before trap output; Bash inserted bracketed-paste ANSI
control bytes there. The captured transcript already showed `HANDLED_INT` and a
live prompt. Correcting only that output matcher made the check pass. Closing the
failed driver's PTY left no survivor in the later normal WSL process inspection.
No dependency or PTY library internal was changed.

## Real provider CLI smoke checks

Already installed Linux providers were selected by prepending their existing bin
directories to each comparison's PATH:

| Provider    | Version | Selected entry (relative to validation workspace unless absolute)                                              | Result |
| ----------- | ------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| Claude Code | 2.1.318 | `tools/node_modules/.bin/claude` → `@anthropic-ai/claude-code/bin/claude.exe`                                  | PASS   |
| Gemini CLI  | 0.67.0  | `vs-4/gemini-tools/node_modules/.bin/gemini` → `@google/gemini-cli/bundle/gemini.js`                           | PASS   |
| Codex CLI   | 0.166.0 | `/home/nikita/.local/share/mise/installs/node/24/bin/codex` → Node 24.22.2 global `@openai/codex/bin/codex.js` | PASS   |

Claude's `.exe`-named target was verified as an x86-64 Linux ELF executable.
For all six `--version`/`--help` comparisons, native and stable project-route
forms returned exit 0 with byte-identical stdout and empty stderr. Commands took
roughly 0.009–2.175 seconds each; these are responsiveness observations, not a
benchmark. Disposable `CLAUDE_CONFIG_DIR`, `GEMINI_CLI_HOME` and `CODEX_HOME`
were used for the final comparisons. No user provider configuration was edited.

Initial checks with inherited user state produced Gemini cleanup warnings because
the sandbox disallowed creating `/home/nikita/.gemini`; two warnings appeared in
different order for help. Codex warned that PATH aliases could not be created on
a read-only filesystem. Stdout and status still matched. Final disposable-state
comparisons removed those environment warnings and all streams matched exactly.
No provider installation, authentication, prompt, model inference or native-hook
execution was performed. Help/version did not require an explicit network step;
network traffic was not instrumented, so offline behavior is not claimed.

## Ownership, recovery and cleanup

PASS: setup ownership and safe deinit, unchanged legacy/new starter removal,
customized starter preservation, refusal of modified managed files, interrupted
uninstall resumption, unresolved setup read-only diagnostics and mutation refusal.
The controlled setup recovery fixture created a claim/stage only after a proven
completed setup, verified manifest-owned files, removed its own empty evidence
entries, then safely deinitialized/reinitialized. Actual stable-installer process
interruptions at four barriers retained incomplete installations as non-runnable,
refused reuse, and left a published installation usable. No existing user
installation was interrupted or corrupted.

All supplemental projects were deinitialized. Child liveness checks passed;
existing stable routed-signal tests also verified recorded native PIDs no longer
existed. Two authorized `ps -eo pid,ppid,pgid,sid,stat,args --sort=pid` inspections
of normal WSL, including the final one after all fixtures completed, showed only
WSL init, the existing user shell, Codex services/session/clipboard bridge and the
inspection command. No Arch runtime, fixture, provider smoke process, npm installer,
PTY driver or unexplained zombie remained. Existing agent processes were preserved.

Disposable runtime, scripts and JSON evidence are retained for audit in
`/home/nikita/arch-validation/vs-1.1b/wsl-control/`, outside the repository. The
reproduction drivers are `check.py`, `nested.py`, `providers.py`, `boundaries.py`;
results are `checks.json`, `nested.json`, `providers.json`, `boundaries.json`,
`focused.json`, `stable.json`, `routing.json`. Drivers expect fresh disposable
project paths for a new run. Only this report is committed; production code,
provider credentials, SSH settings and global startup files were not modified.

## Verdict and limits

**GO.** Mandatory supported WSL2 routing, signal, nested lifecycle and ownership
checks passed, with no unexplained persistent Arch-owned processes. Initial
sandbox and PTY-matcher failures were isolated and their affected checks passed
under the documented corrections. No corrective production decision is required.

This acceptance covers the recorded kernel/ext4/Node/provider versions. DrvFS,
other kernels/emulators, real provider TUIs, native hooks, model inference,
force-killed wrapper descendants and incompatible Node 22 were not certified.
Native-created descendants remain the provider's responsibility under the existing
contract. Windows Avast and Windows node-pty investigations were not reopened.
No merge, deployment, production-code change or macOS acceptance was performed.
