# Validation evidence index

Maintained classification at main `b562cbf86a884c98325b855dfc9dd02f4ac6a727`.
All **16 original report files remain byte-for-byte unchanged at their existing
paths**. Dates below are report execution dates, not import or merge dates.
External `.test-state`, logs and evidence paths in reports are historical references;
this consolidation did not acquire or regenerate those raw artifacts.

An original GO applies only to its measured subject. A later report can qualify a
limitation without rewriting the earlier verdict or proving current-main acceptance.
**BLOCKED**, **NOT TESTED**, **PARTIAL**, and feature-branch deviations stay visible.
For present implementation use [capabilities](../capabilities.md); for source/merge
provenance use the [documentation audit](../documentation-audit.md).

## Revision key

| Label used below                  | Exact revision                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Pre-F1 main                       | `b4c35238614e1df7dc696b05bb286ae6c34b2825` (PR #23 merge)                                                  |
| F1-F5 merge                       | `d028df2d4d76da17bc730234a866316449c04d53` (PR #24)                                                        |
| Approved VS-1 snapshot            | `769a1f6f80adf0dc594105c793bce941986b132c` (feature branch; then-current main equivalence not verified)    |
| Routing spike code                | `69969af79f2631876919639a15b992050f02d316` (review checkout `b4c3523` was not experimental source)         |
| Policy H1-H3 implementation       | `99bd0d3dea74a6af340f605f78ed106417e9ef7e`                                                                 |
| Policy final H4-H5 implementation | `3f6aa20ad617afa5625e22355c6eeb66865f5ad4` (PR #27 head; merge `87c34805e7a2b7527dfcc5ed4f5617f479e1caa7`) |

Working-tree tests are **base plus listed uncommitted changes**, never silently
attributed to the later commit. Policy records contain several measurements; their
section-specific baselines take precedence over this shorthand.

## Platform and process acceptance

| Original report                                             | Execution / platform                                                      | Tested revision | Original verdict and validated scope                                                                  | Caveats and current relevance                                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Windows F1-F5 control](arch-windows-control-acceptance.md) | 2026-11-07; Windows 10 x64, PowerShell/Git Bash, Node 24.19.0             | F1-F5 merge     | CONDITIONAL GO, environment-limited; W1-W4 first-run controls and real non-inference provider routing | Supersedes blocked preflight under explicit Avast override, not active-Avast acceptance. PTY driver gap later addressed by #26; no Windows 11/full authenticated TUI claim |
| [WSL2 control](arch-wsl2-control-acceptance.md)             | 2026-11-07; Ubuntu 22.04.4 WSL2 x86_64/ext4, Node 24.22.2, mise 2026.11.0 | F1-F5 merge     | GO for targeted routing, native process/signals, nested lifecycle, stable installation and ownership  | No inference, DrvFS or universal WSL acceptance. Independent Linux evidence; does not resolve Windows incidents                                                            |

## Provider consumer validation

These test generic **process routing**, not provider-originated policy enforcement.
Versions are the measured provider versions, not current product recommendations.

| Original report                                   | Execution / platform and provider                                                     | Tested revision                          | Original verdict and validated scope                                                                                | Caveats and later qualification                                                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Claude VS-1](claude-code-vs1.md)                 | 2026-11-03 local (some 11-02 UTC); Windows CMD/PowerShell, Claude 2.1.280             | Approved VS-1 snapshot                   | Qualified consumer result; real print requests, bounded edit, startup/exit and transport                            | Three historical inference calls only; current-main baseline NOT VERIFIED. Full interactive NOT TESTED; executable locking/npm-help UNRESOLVED. VS-1R later verifies main for non-inference scope, not renewed inference         |
| [Claude VS-1R](claude-code-vs1r.md)               | 2026-11-04 to 05; Windows, Claude 2.1.280, NTFS installation and NTFS/exFAT consumers | Pre-F1 main                              | Qualified Windows consumer regression acceptance; CMD/PowerShell CLI, listed TUI subset, ownership and genuine mise | Historical incidents remain UNRESOLVED; no paid inference, external-device certification or stability clearance. Later control acceptance is on F1-F5 merge                                                                      |
| [Claude Git Bash](claude-code-vs1-git-bash.md)    | 2026-11-05; Windows Git Bash/MSYS2/ConPTY, Claude 2.1.280                             | Pre-F1 main                              | CONDITIONAL GO for Windows-native CLI and measured ConPTY workflow                                                  | No Windows Terminal/mintty full TUI acceptance; mise PATH growth remains. Not Linux evidence                                                                                                                                     |
| [Claude WSL2](claude-code-vs1-wsl2.md)            | 2026-11-05; Ubuntu 22.04.4 WSL2/ext4, Linux Claude 2.1.318                            | Pre-F1 main                              | Environment PASS; CONDITIONAL GO for CLI, lifecycle and mise                                                        | Earlier supplied environment NOT TESTED history preserved. Direct/routed onboarding Ctrl+C did not settle; full authenticated interactive unaccepted. Later WSL2 control adds F1-F5 process acceptance, not onboarding clearance |
| [Codex Windows](codex-vs3-windows.md)             | 2026-11-05; Windows PowerShell 5.1/Git Bash, Codex 0.163.0                            | Pre-F1 main                              | CONDITIONAL GO for non-inference CLI and one-generation OS-process self-invocation                                  | PowerShell quoting PARTIAL, TUI incomplete; failed driver excluded. No semantic delegation or shared-parent SQLite concurrency acceptance                                                                                        |
| [Codex WSL2](codex-vs3-wsl2.md)                   | 2026-11-05; Ubuntu WSL2/ext4, Codex 0.166.0                                           | Pre-F1 main                              | CONDITIONAL GO for genuine Linux CLI routing, terminal activation and parent shell-tool process invocation          | DNS blocker resolved in report; earlier failed regression retained, changed executor behavior unexplained. No inference, mature TUI or authenticated-state concurrency claim                                                     |
| [Gemini Windows](gemini-vs2-windows.md)           | 2026-11-05; Windows PowerShell 5.1/Git Bash, Gemini 0.55.1                            | Pre-F1 main                              | CONDITIONAL GO for measured non-inference CLI routing and provider isolation                                        | PowerShell arbitrary quotes/empty args differ before Arch; TUI shell return failed direct/routed bounded controls. No model calls or complete interactive claim                                                                  |
| [Gemini WSL2](gemini-vs2-wsl2.md)                 | 2026-11-05; Ubuntu WSL2/ext4, Gemini 0.67.0                                           | Pre-F1 main                              | CONDITIONAL GO for Linux CLI routing/activation, ancestry and multi-provider isolation                              | Supersedes missing-provider blocker after authorized isolated install; no authentication/keychain, mature TUI or inference acceptance. Earlier DNS/regression failures remain historical                                         |
| [Codex child Windows](codex-vs3-child-windows.md) | 2026-11-05 including MXC continuation; Windows PowerShell/Git Bash, Codex 0.163.0     | Pre-F1 main (VS-3.0 installation reused) | Sandbox prerequisite BLOCKED; native/routed CLI preflights reach provider                                           | Restricted read-only boundary needs unavailable elevated backend; MXC unavailable. Semantic delegation NOT TESTED; 0 of 2 inference calls. Not superseded by later routing or PTY success                                        |
| [Codex child WSL2](codex-vs3-child-wsl2.md)       | 2026-11-05; Ubuntu WSL2/ext4, Codex 0.166.0                                           | Pre-F1 main                              | BLOCKED at native bubblewrap prerequisite; process route verified separately                                        | No semantic child inference, task-read or child-session result. Earlier DNS blocker resolved, sandbox blocker remains; no weaker sandbox substituted                                                                             |

## Architecture and routing investigation

| Original report                                              | Execution / environment                                                                                  | Tested revision    | Original verdict and scope                                                      | Caveats / current relevance                                                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Routing activation spike](arch-routing-activation-spike.md) | Execution date not explicitly recorded; macOS 26.1 arm64, zsh, Claude 2.1.319, private Arch Node 24.19.0 | Routing spike code | Investigation only; recommendation NO CHANGE to Core, explicit routing contract | Observed PATH/snapshot/rc mechanics; actual Arch-launched Claude Bash-tool PATH not re-observed. No inference or blocking-hook acceptance; provider-adapter option remains hypothetical |

## Infrastructure hardening and historical investigation

| Original report                                                   | Execution / platform                                     | Tested revision                                 | Original verdict and scope                                                                           | Later qualification                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Windows PTY lifecycle](windows-pty-lifecycle.md)                 | 2026-11-07; Windows 10 x64, node-pty 1.1.0/ConPTY        | F1-F5 merge plus uncommitted standalone scripts | CONDITIONAL GO, test-infrastructure lifetime understood/contained; no Core defect demonstrated       | Historical private-field adapter is superseded by public-API dedicated-driver design. Its natural-exit claims do not describe #26's explicit driver-exit protocol                                                                                            |
| [Windows PTY cleanup hardening](windows-pty-cleanup-hardening.md) | 2026-11-09; Windows 10 x64, Node 24.19.0, node-pty 1.1.0 | F1-F5 merge plus listed uncommitted files       | GO for isolated Windows test-driver contract; session/driver/helper settlement and negative controls | Production process behavior unchanged. Original report says no commit/merge at execution time; #26 subsequently merged. Driver exits explicitly after result/release acknowledgement; CIM visibility and deterministic non-detaching fixtures limit evidence |

PR #26's [merged review record](https://github.com/Nickshajtan/hcc-harness/pull/26)
additionally records inspected hosted artifacts for `d476f02` and final head
`11d9e2138b1e5b07c03e18c534a3022e125ef363`:
[runtime run 42708080720](https://github.com/Nickshajtan/hcc-harness/actions/runs/42708080720).
These are **reported inspected results in the PR**, not artifacts re-downloaded or
CI independently rerun during this documentation task. They qualify the original
working-tree report without changing it.

## Policy engine validation

| Original report                               | Execution / platform              | Tested revision                                                                                                                        | Original verdict and scope                                                                                                                              | Caveats / current relevance                                                                                                                                                                                                      |
| --------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Policy VS1 and H1-H5](provider-policy-v1.md) | 2026-11-10; Windows, Node 24.19.0 | Multiple feature-branch sections: VS1, H1-H3, then reviewed `99bd0d3` plus H4-H5 changes; final implementation `3f6aa20` merged in #27 | CONDITIONAL GO for cooperative in-process policy and mock protocol; focused failures, cleanup and transport regressions, coverage/mutation measurements | Original feature-branch/hosted-pending statements remain historical. Merge makes source shipping, not native enforcement or cross-platform policy acceptance. No Claude/Codex/Gemini hook tested; no hard JavaScript termination |

## Related historical records outside this directory

- [FS-1](../fs-1-publication.md): DESIGN BLOCKED for supported Node-only
  publication primitives at `15f46357d8dd6fb9cc8a33933b6fab08b5fd7ac2` (2026-11-03).
  Native bridge in [FS-1.2](../fs-1.2-native-publication.md) supersedes the Node-only
  design limit, not every historical exFAT runtime failure.
- [FS-1.0a](../fs-1.0a-setup-publication.md): setup publication implementation
  at baseline `368391d`; original detailed validation and failure controls retained.
- [FS-1.2](../fs-1.2-native-publication.md): baseline
  `e7d4dabbe0017571167830b0192b158326febd35`, durable setup-authority amendment,
  unresolved external exFAT execution/sharing acceptance. VS-1R later tests an NTFS
  installation with exFAT consumers under its own conditions.
- [F1-F5 ledger](../stabilization-f1-f5.md): baseline pre-F1 main,
  implementation `e1877b4ce204f7bf42c791c1766e01107cfdece1`, blocked pre-merge review;
  2026-11-07 controlled Avast comparison at `c0dd27e03b2bb3226e4a153912c26c4846f7de99`
  changes recommendation to CONDITIONAL GO. Protection state was user-reported,
  not conclusive component verification. Separate test handle-release correction
  culminated in PR #24 head `65ff0a3`. Later control reports test its merge.
- [Quality baseline](../standards/quality-baseline.md): revision-specific quality
  measurements and unresolved executable-access/npm-help incidents. Passing newer
  scoped checks do not independently establish causal incident resolution.

## Preservation and migration mapping

No move/rename occurred: every `docs/validation/<name>.md` listed above maps to
itself. No report observations, timestamps, SHA, verdict, negative control or
limitation were rewritten. Root-level milestone records retain their original
body with an added historical-status banner; standards measurements receive a
scope banner. Canonical guides remove stale present-tense claims instead of
rewriting unique experimental evidence. There are no missing report redirects.
