# VS-1.1a — Git Bash Claude Consumer Validation

Executed 2026-11-05 (Europe/Kiev). **CONDITIONAL GO for measured Windows-native
CLI and ConPTY workflows.** Full terminal-host support is not established:
Windows Terminal is unavailable, mintty interactive TUI/input is not accepted,
and interactive mise hooks accumulate standard PATH entries.

No production changes, paid inference, installation/upgrades, profile edits,
security changes, commits, merges or deployment were performed.

## Baseline and evidence

Fresh GitHub main query returned `b4c35238614e1df7dc696b05bb286ae6c34b2825`,
tree `0d6cb93f29ea57b108ba9202a6f05f11cfdbb806`: PR #23, FS-1.2 included.
This is unchanged from VS-1R. Ordinary Git HTTPS fetch still fails because the
configured CA bundle is inaccessible; no TLS checks were disabled. The connected
GitHub API verified fresh main against the already available exact commit/tree.
A new detached worktree was clean before validation; this report is its only change.
See external `upstream-baseline.json`.

The VS-1 and VS-1R reports were reviewed and retained. Their three historical
inference calls, CMD/PowerShell acceptance, 60 controlled version attempts and
unresolved Windows reliability incidents remain historical evidence. This slice
does not rerun or upgrade their claims. The same verified independent NTFS stable
installation is reused; **92/92 installed resource hashes still match**.
Source-checkout independence was established in VS-1R for this exact installation.

Raw evidence root (**E**):
`D:\AI\arch-validation\evidence\claude-vs1-git-bash`.
`config.json` records exact owned paths; scripts and JSON/ANSI logs remain outside
the repository. Each operation's `.bash` file retains its exact command.
No credentials, auth status or complete environment were collected. Only selected
PATH/MSYS/terminal variables and a harmless sentinel were recorded.

## Environment

| Item                | Measured value                                                                      |
| ------------------- | ----------------------------------------------------------------------------------- |
| Windows             | x64, 10.0.19045; classic-console user setup, not Windows Terminal                   |
| Node                | existing Windows v24.19.0                                                           |
| Claude              | existing Windows-native 2.1.280, `%USERPROFILE%\.local\bin\claude.exe`              |
| Git for Windows     | 2.46.2.windows.1                                                                    |
| Bash                | 5.2.37(1)-release                                                                   |
| Shell executable    | `%ProgramFiles%\Git\bin\bash.exe` launcher; actual `/usr/bin/bash`                  |
| MSYS runtime        | 3.4.10-bc1f6498.x86_64, DLL version recorded; Git-bundled runtime, not a Linux port |
| mise                | existing NTFS 2026.10.11 windows-x64                                                |
| MSYSTEM             | `MINGW64`                                                                           |
| MSYS                | inherited `disable_pcon`, retained throughout                                       |
| MSYS2_ARG_CONV_EXCL | initially unset; `*` only in separate bounded probe diagnostics                     |
| ConPTY terminal     | node-pty 1.1.0, 110 columns × 32 rows; inherited `TERM=dumb`                        |
| mintty              | installed 3.7.6; native diagnostic reported `TERM=xterm`                            |

Git Bash was explicitly selected; the unrelated Windows System32 `bash.exe` was
not used. Noninteractive invocations used `--noprofile --norc <owned-script>`.
Interactive ConPTY used `--noprofile --norc -i`, flags `himBHs`, non-login shell.
The user's shell profiles were neither executed nor edited. Native Claude kept
its existing user environment; no authentication was changed. Login/profile-based
startup is **NOT TESTED**.

New consumers are outside every checkout: one NTFS temporary project with spaces
and Ukrainian characters in its name, and one uniquely owned D: exFAT project.
.NET DriveInfo verified C: NTFS and D: exFAT. Physical external attachment was
not independently established. Arch remains on NTFS; no new consumer compiler,
runtime download, npm link or global alias is required.

Native Claude SHA-256 remained
`0e4195524b73eb77efbdf3e2b36de5322a29f0ca575dfd2d9b4f946b1d425469`.
The Bash spelling `claude` resolves the native `.exe` through MSYS executable
lookup; no extensionless replacement or Claude fixture was installed.

## Activation and resolution

Actual interactive activation evaluated the installed mise's generated Bash hook:

```bash
eval "$(mise activate bash)"
cd "$consumer"
type -a claude
command -v claude
which -a claude
where.exe claude
claude --version
```

Before entry, Bash selected native Claude. After entering NTFS or exFAT, it selected
that project's `.arch/bin/claude`; real execution emitted one Arch start event for
the correct project. Leaving restored native resolution. Reentry and reevaluating
activation retained one project launcher entry and correct routing. No `hash -r`
was required for acceptance. `claude.exe` and uppercase `CLAUDE` were also found in
this tested filesystem/environment; this is not a portable case-sensitivity claim.

Evidence: `pty-activation.json`, `records-diagnostics.json`. The ConPTY driver used
an explicit owned input channel, avoiding VS-1R's closed-stdin harness mistake.
The repeated noninteractive loop separately evaluated `mise hook-env -s bash`;
that is explicit hook execution, **not** automatic interactive activation proof.

**Observed limitation: PATH growth.** Standard `/usr/bin` entries accumulated after
interactive prompts, including while outside all Arch projects. Project `.arch/bin`
did not duplicate and native fallback on leaving remained correct. Three successive
outside-project PATH samples reproduce growth without an active Arch route. The
separate noninteractive hook loop did not reproduce it. Likely subsystem:
interactive mise/MSYS PATH handling; confidence moderate. Arch is not necessary
for the outside-project observation. The precise mechanism and containment are
**UNRESOLVED**. No permanent deduplication or activation workaround was introduced.
Thus the requested “repeated activation without PATH duplication” is **PARTIAL**.

**VS-1R `where.exe` observation reproduced.** Bash `type`, `command -v` and `which`
selected the NTFS project launcher, but `where.exe` listed only global native
Claude. On exFAT it listed launcher then native. A native probe recorded the Windows
child PATH, including the correct NTFS launcher directory. Running `where.exe`
outside Bash with that PATH still omitted it; converting all slashes to backslashes
did not fix the observation. Restricting PATH to the NTFS launcher directory also
failed enumeration, while native execution and Arch trace passed. `hash -r` did
not change the discrepancy. Mixed slashes or Bash's command cache alone therefore
do not explain these measured cases. Exact cause remains **UNRESOLVED**; no claim
that Unicode or NTFS itself causes it. See `where-isolation.json`,
`*-where-original.json`, `*-where-normalized.json`, `records-path-diagnose.json`.

Bash PATH uses colon-separated POSIX entries, including `/tmp` aliases for Windows
temporary directories; native-child PATH uses semicolon-separated Windows paths.
The extended probe records cwd, its actual Windows executable, PID, selected
environment and stream-redirection flags. Routed native PATH excludes project
router entries, consistent with recursive-discovery protection; no source path
was introduced. Initial controlled PATH had repeated standard aliases, but no
empty component; subsequent interactive growth is reported separately above.

## Argument conversion and CLI parity

**PASS:** 12 native argument probes: NTFS/exFAT × direct/project-launcher/mise ×
default/excluded conversion. Within each filesystem/conversion condition, received
argv, cwd, sentinel, stdin and stdout matched exactly across all three paths;
known native stderr and exit 7 were preserved, with additional visible Arch trace.
See `records-argv.json`, `argv-decoded.json`.

| Shell input class                                                   | Default native receipt              | With process-local exclusion |
| ------------------------------------------------------------------- | ----------------------------------- | ---------------------------- |
| `/d/work/project`                                                   | `D:/work/project`                   | literal `/d/work/project`    |
| `/help`, `/test`                                                    | paths below Git's installation root | literal slash flags          |
| `/c/one:/d/two`                                                     | Windows semicolon path list         | literal POSIX path list      |
| `D:\work\project`, `C:\Program Files\item`                          | unchanged                           | unchanged                    |
| `./file`, `../file`, `key:value`                                    | unchanged                           | unchanged                    |
| spaces, Ukrainian text, backslashes, embedded quote, empty argument | preserved                           | preserved                    |

Arguments were Bash single-quoted by the driver, separating shell parsing from
native conversion. Transformations already occur for the directly invoked native
fixture; inserting mise/Arch did not add corruption. `MSYS2_ARG_CONV_EXCL='*'`
changes that boundary behavior equally for all paths. This is a diagnostic option,
not an installed default or universal recommendation: callers must distinguish
intended POSIX-path conversion from arguments that must remain literal.

**PASS:** 18 actual Claude comparisons: NTFS/exFAT × direct/launcher/mise ×
version/help/invalid option. Version/help stdout matched, statuses were 0/0/1,
and native error stderr was retained. All routed cases emitted one start event
for the correct project. Probe success is not substituted for these real CLI calls.
Arch's trace/demo middleware adds stderr diagnostics intentionally; raw differences
are retained rather than silently normalized (`records-parity.json`).

No Git Bash-specific routing wrapper, extra production shell, global alias,
Linux CLI, WSL dependency or permission bypass was introduced. Print/inference
behavior remains **NOT TESTED in this slice**; historical VS-1 inference is unchanged.

## Terminal hosts, signals and process lifetime

| Host                               | Result                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Windows Terminal + Git Bash        | **UNAVAILABLE / NOT TESTED**: no executable/package found; user confirmed classic console usage |
| node-pty Windows ConPTY + Git Bash | **PASS measured subset** on both consumers; not Windows Terminal or classic conhost acceptance  |
| mintty                             | **PARTIAL**: native probe and real Claude version passed; interactive TUI/input not accepted    |
| Classic conhost + Git Bash         | **NOT TESTED** as a separate host; user's classic CMD usage is not Git Bash evidence            |

In ConPTY, real routed Claude reached its normal TUI after trust/startup interaction
on both consumers. ANSI updates and unsent text/cursor movement responded; input
was cleared without submission. `stty size` reported 32×110. exFAT used `/exit`;
NTFS used an idle Ctrl+C pair. Both emitted Arch completion with exit 0, returned
to usable Bash, reported shell status 0, and the owned shell subsequently exited 0.
Native auto-update failure remained visible, as in VS-1/VS-1R; it was not repaired.

Ctrl+C here is terminal key delivery handled during idle TUI, not proof of injected
Windows console-control events, POSIX process-group equivalence or cancellation
during inference. Resize, disconnect, active inference, independent signal injection
and complete native descendant-tree capture are **NOT TESTED**. Final process-name
inspection found no Claude processes; that is not a machine-wide handle audit.

Mintty's hidden bounded native diagnostic logged `/dev/cons0`, a terminal size,
unredirected native stdin/stdout, and real version exit 0 (`mintty-native.log`).
This does not prove TUI behavior or a requirement for winpty. Existing winpty was
located but never installed, enabled or assumed necessary.

A separately owned mintty interactive launch reached `GBM>` in its log, but the
desktop-control API returned no matching target window. It therefore received no
UI keyboard actions and no Claude TUI acceptance credit. MSYS process diagnostics
identified its newly created mintty PID and Bash descendants, distinct from the
older user-owned Git Bash windows. Only the identified owned mintty received TERM;
its shell descendants disappeared and the launch driver completed. Original user
mintty processes were untouched. See `mintty-interactive-launch.json`,
`mintty-interactive.log`, `records-mintty-inspect.json`,
`records-mintty-cleanup.json`. This is a host-control limitation, not an Arch failure.

## Bounded reliability and lifecycle

| Consumer | Direct native     | Explicit launcher | Mise-activated Bash command |
| -------- | ----------------- | ----------------- | --------------------------- |
| NTFS     | 5/5, 3084–3270 ms | 5/5, 3324–3446 ms | 5/5, 3619–3789 ms           |
| exFAT    | 5/5, 3180–3230 ms | 5/5, 3409–3500 ms | 5/5, 3714–3812 ms           |

**Historical stalls/sharing failures NOT REPRODUCED in 30 bounded attempts.**
All returned real Claude version, exit 0 and stream closure; all 20 routed calls
had one Arch start event. Each path had five sequential independent Bash invocations,
interleaved by iteration, 20-second per-operation and five-minute overall budgets.
No failed attempt was silently retried. These noninteractive repetitions evaluate
the actual mise hook before plain command execution; interactive activation is
proven separately. Exact scripts/PIDs/streams/status/durations:
`records-repeat.json`. Historical incidents remain **UNRESOLVED, not FIXED**.

The representative Git Bash lifecycle passed on both actual filesystems:
fresh init/status, identical init, no pending `.arch/setup-claim`, real routed
Claude, codex addition/removal, controlled interruption after actual publication,
pending-recovery inspection, configure recovery, foreign collision refusal,
deinit, and foreign/unrelated preservation. The checkpoint worker imported only
the independently installed lifecycle and was invoked from Bash. A persisted
checkpoint recorded its actual PID before targeted termination; no timing-based
kill or manual claim/journal clearing was used. Subsequent recovery/deinit commands
ran through Git Bash. Ownership checks include foreign bytes and file identity.
See `records-setup.json`, `records-lifecycle.json`, `lifecycle-checks.json`,
`*-interruption-result.json` and the retained worker scripts/checkpoints.

Lifecycle mutation was kept separate from the version loop and active TUI sessions,
avoiding VS-1R's overlapping-removal harness defect. Both owned projects were later
reinitialized for the mintty diagnostic setup and ended initialized/valid without
pending recovery (`records-mintty-prepare.json`, `records-final.json`).

## Checks, limits and decision

`node gb-check.mjs` passed evidence assertions for 18 real CLI comparisons,
12 argv probes, 30 repetitions, both lifecycle sequences, integrity and recorded
ConPTY shell settlement. Report formatting and diff checks passed. No full new
coverage, mutation or CMD/PowerShell matrix was run. Unchanged-main VS-1R focused
regressions, inspected main CI and FS-1.2 source-matching evidence remain the broader
baseline; their historical qualifications are retained.

| Gate                       | Verdict                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| A — interactive activation | **PARTIAL:** routing/leave/reentry pass; standard PATH growth violates duplication criterion |
| B — native resolution      | **PASS** by execution/trace; `where.exe` diagnostic discrepancy unresolved                   |
| C — argument integrity     | **PASS** for measured cases; MSYS2 boundary conversion understood                            |
| D — CLI parity             | **PASS** on NTFS and exFAT                                                                   |
| E — interactive execution  | **PARTIAL:** ConPTY passes; Windows Terminal unavailable; mintty TUI/input not tested        |
| F — lifecycle              | **PASS** for representative Git Bash sequences on both filesystems                           |
| G — reliability            | **PASS bounded evidence**, historical incidents unresolved                                   |
| H — evidence               | **PASS with explicit failures, discrepancies and host gaps**                                 |

**CONDITIONAL GO.** Git Bash correctly routes the existing Windows-native Arch →
Claude CLI on both NTFS and exFAT, and the measured ConPTY TUI subset works without
winpty. Do not yet mark Git Bash unconditionally supported across terminal hosts.
Carry the mise interactive PATH-growth observation and required host acceptance
forward; direct `mise exec` is a measured explicit-execution option, not a claim
that automatic activation is entirely defect-free. No unsafe ownership behavior
or Arch-added argument corruption was established, so a BLOCKED safety verdict
is not justified by this evidence.

**Proceed to VS-1.1b — WSL2 as a separate validation slice.** This does not close
the Git Bash terminal-host gaps or historical Windows reliability incidents.
No WSL2 execution, additional provider or production fix was attempted here.
