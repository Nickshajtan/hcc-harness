# Documentation baseline audit

Recorded 2026-11-11. Recommendation: **CONDITIONAL GO for documentation review**.
This is not software release acceptance. Native adapter enforcement, provider TUI
coverage, active-Avast compatibility and restricted child sandboxes retain their
explicit gaps; the original evidence is not converted into broader success.

## Source and merged implementation provenance

Base/main: `b562cbf86a884c98325b855dfc9dd02f4ac6a727`, verified by fresh
`git fetch origin main` and `git rev-parse origin/main`. The checkout initially
matched main and was clean. Work is isolated on `docs/architecture-baseline`.
Final documentation commit is recorded in the PR description to avoid a
self-referential SHA inside its own commit.

Connected GitHub PR metadata confirmed all three PRs closed and merged. Their
merge commits are ancestors of the inspected base:

| PR                                                                         | Final feature head                         | Merge commit                               |
| -------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| [#24 F1-F5](https://github.com/Nickshajtan/hcc-harness/pull/24)            | `65ff0a3b429f781d7c2f8a5a70dc3ff8809d0b8b` | `d028df2d4d76da17bc730234a866316449c04d53` |
| [#26 Windows PTY](https://github.com/Nickshajtan/hcc-harness/pull/26)      | `11d9e2138b1e5b07c03e18c534a3022e125ef363` | `9d32f64a38c550dff620f4bcd0f793572294c79c` |
| [#27 Policy VS1/H1-H5](https://github.com/Nickshajtan/hcc-harness/pull/27) | `3f6aa20ad617afa5625e22355c6eeb66865f5ad4` | `87c34805e7a2b7527dfcc5ed4f5617f479e1caa7` |

The initial sandboxed SSH fetch could not access known_hosts; approved fetch
succeeded with normal host verification. Local `gh` returned authentication 401,
so connected GitHub metadata supplied PR verification. No failed command was
counted as successful verification. Hosted job/artifact claims are attributed to
original reports or the merged PR record; CI was not independently rerun here.

## Reconciliation and extension boundaries

- README and runtime guide now distinguish implemented stable installation from
  historical B1 feasibility and B2 scope restrictions. Later real-provider routing
  evidence is separate from the B2 controlled-fixture acceptance contract.
- Architecture distinguishes Core process supervision, process middleware,
  observational EventBus, independent policy dispatch, planned native adapters,
  future policy modules and provider-owned native orchestration.
- Canonical publication guidance now reflects POSIX hard links versus Windows x64
  native no-replace moves and the unresolved setup-claim guard. Historical FS
  records retain their original earlier algorithms and failures.
- Early F1-F5 BLOCKED statements remain in the historical ledger. Its own later
  controlled Avast comparison changes review recommendation to CONDITIONAL GO;
  separate Windows conditional and WSL2 GO acceptance retain their environments.
- Required policy applicability is explicit: missing/disabled requirements fail
  at configuration; a required module with no applicable handler fails at
  registration with code `configuration-error`. Stages and codes are different.
- Windows PTY isolation is a test-driver lifecycle decision, not production
  descendant supervision. The historical private adapter is not the shipped #26
  implementation. Driver exit is explicit after result/release acknowledgement.

## Evidence preservation and move mapping

All 16 pre-existing `docs/validation/*.md` reports remain byte-identical to base
Git blobs. The new [validation index](validation/README.md) classifies each report
with date, platform/provider, tested revision, original verdict, scope, caveats and
later qualification. Working-tree measurements remain base-plus-changes, not
invented final-commit acceptance. External raw logs are referenced, not reconstructed.

**Moves/renames: none.** Every previous evidence path maps to itself; no redirect
or migration lookup is needed. FS-1, FS-1.0a, FS-1.2, F1-F5 and the quality baseline
receive historical-scope banners only; their original bodies remain intact.
The original nested-execution decision text is retained with consistent ADR
headings, alternatives and implementation references. Eight additional ADRs record
major boundaries; [ADR index](decisions/README.md) lists all nine.

## Verification checklist

| Check                                                                     | Result and limitation                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Fresh main and merged #24/#26/#27 metadata/ancestry                       | PASS at the recorded base; final PR body records final recheck                                                       |
| Relative Markdown file links and heading anchors                          | PASS across root README and every Markdown file in docs; final count in PR body                                      |
| Evidence preservation                                                     | PASS: 16 report byte comparisons against base blobs; historical milestone diffs contain banners only                 |
| Mermaid syntax and local SVG rendering                                    | PASS: all six diagrams using Mermaid 11 in Chromium; README preview inspected                                        |
| GitHub rendering compatibility                                            | Standard flowchart/sequence syntax, no custom styles/assets; authenticated GitHub page rendering NOT TESTED          |
| Changed-document formatting                                               | PASS using pinned Prettier on every changed/new Markdown file                                                        |
| Whole documentation formatting                                            | FAIL: eight original report files already fail pinned Prettier at base; unchanged to preserve evidence               |
| Whitespace and documentation-only diff                                    | PASS via `git diff --check` and changed-path review; no src/tests/config/dependency/CI changes                       |
| Status/guarantee consistency review                                       | PASS for canonical guidance; historical BLOCKED/GO/NOT TESTED labels intentionally retained with scope banners/index |
| Software acceptance, mutation, paid inference and native hook enforcement | NOT TESTED for this documentation-only task; no execution result inferred                                            |

Whole-documentation formatting failures are confined to original
`arch-routing-activation-spike.md`, `claude-code-vs1-wsl2.md`,
`codex-vs3-child-windows.md`, `codex-vs3-child-wsl2.md`, `codex-vs3-windows.md`,
`codex-vs3-wsl2.md`, `gemini-vs2-windows.md` and `gemini-vs2-wsl2.md` under
`docs/validation/`. No formatter exclusions, workflow changes or weakened gates
were introduced. This disclosed baseline limitation may still fail existing CI;
changed-document formatting is reported separately, not substituted for it.

## Remaining ambiguities and maintainer findings

No production change is proposed. No newly proven source defect was established
by this documentation review. Outstanding evidence questions remain:

- Active-Avast compatibility is not established; [issue #25](https://github.com/Nickshajtan/hcc-harness/issues/25)
  and older executable-access/npm-help incidents remain open in their own scope.
- Native provider blocking hooks and adapters are absent. Mock dispatch and
  transport acceptance do not establish Claude/Codex/Gemini enforcement.
- Restricted Codex child tasks remain backend-BLOCKED on both recorded platforms;
  no semantic inference result exists. Provider TUI/quoting and authenticated state
  gaps are listed in [compatibility](compatibility.md).
- The routing spike does not explicitly date its execution and does not re-observe
  the actual Arch-launched Claude tool-shell PATH. Its hypothesis stays labelled.
- Some evidence lives outside this repository; retention/access was not reverified.
  Policy and PTY reports describe working-tree or feature-branch measurements;
  merged source is present, but they are not fresh tests of `b562cbf`.
- The root AGENTS instruction still describes real AI CLI integration as outside
  B2. That remains accurate for B2 authorization, but must not be read as denying
  later, separately performed provider consumer validation. AGENTS is unchanged.

There is no unresolved contradiction between the inspected source and the revised
canonical guarantees known from this audit. Remaining gaps limit acceptance scope,
not a license to invent implementation or rewrite original evidence.
