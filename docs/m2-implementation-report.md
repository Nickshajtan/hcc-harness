# M2 implementation and validation report

Status: **CONDITIONAL GO for M2 on the tested environments and supporting local
filesystems**. Automated acceptance passed on Ubuntu, macOS and native Windows;
the limitations below remain explicit. No merge or release has been performed.

## Implementation

M2 adds deterministic installation inspection, route planning/reconciliation and
recovery, native CLI discovery, an injectable terminal wizard, strict public CLI
handling, and confirmation-based deinitialization. Deprecated `uninstall` retains
M1's unattended behavior and ownership checks. Explicit init/configure route sets,
route add/remove/list, status JSON and deinit --yes require no interaction.

The unversioned M1 bootstrap format remains accepted. Shared launcher bytes and
hashes survive routing updates; route selection does not write middleware config.
Exclusive hard links publish complete new files without replacing collisions;
same-directory rename replaces only the already-owned bootstrap. A minimal routing
journal records old/new ownership and new payloads. No generic transaction framework,
runtime dependency, provider integration, RTK module or execution API was introduced.

Core, EDA/events, middleware and native process execution source files are unchanged.
The CLI dispatcher body retains its execution/signal behavior.

## Acceptance evidence

PASS means measured in the indicated environment, not inferred for other platforms.
The final hosted matrix and real-TTY verification are separate acceptance areas.

| Area | Result | Evidence |
| --- | --- | --- |
| Core/EDA/middleware/process contracts | PASS | No source diffs in those modules; existing regressions and A/B/C acceptance pass on all three hosted OSes |
| M1 fixtures before strict invariants | PASS | Frozen generator at bfbca214; initial 2 fixture tests passed before parser changes; expanded suite passes on all three OSes with old hashes/paths/order, harness ownership/config edits and recovery |
| Minimal exclusive publication | PASS | All three hosted OSes: complete live bytes and hard-link count asserted; collisions preserve unknown bytes; unsupported links leave old routes intact |
| Routing reconcile/recovery | PASS | All three hosted OSes: real IPC subprocess termination and CLI resume at journal, staging, publication, deletion, before/after manifest replacement and cleanup; Windows additionally interrupts between exe/shim publications |
| Manifest replacement | PASS | Real replacement during reconciliation/recovery on all three hosted OSes; injected sharing failure retains old bootstrap and journal for retry |
| Installation versus activation | PASS | All three hosted OSes: init without mise succeeds; status separates installation from PATH/mise observations and never claims verified parent-shell activation |
| Legacy uninstall / new deinit | PASS | Hosted unattended uninstall regressions unchanged; deprecation notice; deinit non-TTY refusal and --yes removal; simulated and actual Windows default-No/cancellation |
| Deterministic wizard equivalents | PASS | Hosted injected defaults/custom names/cancellation/configuration/removal; explicit init/configure, status and deinit --yes integration; actual Windows terminal walkthrough |
| Scope boundaries | PASS | Changes are limited to setup/lifecycle, discovery, CLI/wizard, tests and documentation; no RTK, provider adapters, orchestration, Core/EDA/middleware/process module changes |
| Full local automated validation | PASS | Final local npm run check: typecheck, lint, build; 15 files, 116 passed, 3 platform skips (119 total), zero failures |
| Ubuntu/macOS/native-Windows hosted matrix | PASS | Corrected run 39842274327, implementation commit 55f26809; per-job links/counts below |
| Real terminal Arch wizard | PASS (Windows) | Native PTY confirmed stdin/stdout TTY; custom initialization, reserved/duplicate rejection, summary confirmation, interactive route replacement, default-No deinit, confirmed removal, and Ctrl+C without project writes |
| Installed AI CLI TUI / parent-shell activation smoke | NOT TESTED | Discovery did not execute installed AI tools; native fixtures and mise-exec do not establish interactive provider tool or parent-shell behavior |
| Windows ARM64 / network filesystems / power-loss durability | NOT TESTED | No claim beyond the measured hosted OSes and local Windows x64; no power-loss simulation |

## Environment and limitations

Local environment: native Windows x64, Node 24.19.0. The checkout is on an exFAT
volume (confirmed with `fsutil fsinfo volumeinfo D:`), where hard-link publication
fails. A probe and the routing suites succeed in Windows temporary storage, so M2
tests deliberately use OS temporary directories for supported-filesystem behavior.
There is no silent overwrite/copy fallback for unsupported filesystems. Fresh M1
setup/uninstall do not require hard links; M2 reconciliation does.

Only one mutator per project is supported. Exclusive journals reject detectable
conflicts but do not eliminate all concurrent filesystem races. The operation is
recoverable, not an atomic switch of an entire route set. Windows exe/shim pairs
can be partially published at interruption; recovery completes the pair. Unknown
or modified live/staged bytes block recovery and are preserved. Partial private
staging requires restoration from the journal; an orphan pre-journal staging file
must be inspected and moved aside. Fresh init retains M1's caught-error rollback,
not crash-atomic publication. There is no fsync/power-loss guarantee.

Successful installation says nothing definitive about parent-shell hooks, trust,
aliases or functions. Status exposes observations and leaves shell activation
unknown; mise-exec integration proves routing for its subprocess only.

## CI evidence

Submitted branch: `feat/m2-routing-lifecycle`, based on the unchanged local M1 head
`bfbca214ae60a9c9ee6e66c30e27df7e77176270`. Source/test implementation verified at
`55f26809cadba3cc9c1c6d3d827525523eb62578`; subsequent report changes are documentation
only. The connected GitHub account submitted the branch; the local GitHub CLI's
invalid credential was not used. No PR, merge or release was created.

The [first M2 run](https://github.com/Nickshajtan/hcc-harness/actions/runs/39781168619)
failed Windows/macOS unit suites; Ubuntu passed. Between runs, the discovery fixture
expectation was normalized with `realpath` to match the resolver's contract across
macOS `/private` paths and Windows path aliases. CI failure-summary annotations
were also added. The original authenticated log download was unavailable; the
portable-path mismatch was inferred from the assertion and environment differences.
No production behavior was relaxed to make these tests pass.

The [corrected matrix](https://github.com/Nickshajtan/hcc-harness/actions/runs/39842274327)
completed successfully. Results below were read from the completed job conclusions
and the workflow's per-suite JSON summary annotations:

| Hosted job | Unit | Integration | Acceptance | Feasibility | Result |
| --- | --- | --- | --- | --- | --- |
| [Ubuntu](https://github.com/Nickshajtan/hcc-harness/actions/runs/39842274327/job/120046157942) | 90 passed | 24 passed, 2 platform skips | 1 passed | Step passed | PASS |
| [macOS](https://github.com/Nickshajtan/hcc-harness/actions/runs/39842274327/job/120046157670) | 90 passed | 24 passed, 2 platform skips | 1 passed | Step passed | PASS |
| [Native Windows](https://github.com/Nickshajtan/hcc-harness/actions/runs/39842274327/job/120046157130) | 89 passed, 1 platform skip | 25 passed, 2 platform skips | 1 passed | Step passed | PASS |

All three jobs passed dependency installation, type checking, lint and build.
Per-platform JSON reports and routing experiment evidence are uploaded by the
workflow. Platform skips are the existing POSIX versus Windows process tests;
M2 hard-link, reconciliation and real interruption tests are not skipped. Hosted
OS labels are recorded as executed; no unobserved CPU-architecture claim is made.
The historical M1 CI links elsewhere in the repository are not M2 evidence.

Local final `npm run check`: 15 files passed, 116 tests passed, 3 platform skips,
zero failures (119 total), including feasibility. The later discovery assertion
normalization also passed its targeted local suite (2 tests), then the complete
hosted matrix. No further production changes followed the passing matrix.

Actual Windows terminal checks used a disposable supporting-filesystem project.
Ctrl+C during selection left it empty; a later accepted custom selection produced
the managed resources. Configure changed `custom` to `custom, custom2`; declining
deinit retained a valid installation and accepting it returned status to
uninitialized. Successful output consistently left shell activation unverified.
These checks did not launch installed Claude/Codex/Gemini tools or modify their
credentials/configuration. Detailed manual AI TUI/shell checks remain in testing.md.

## Recommendation

**CONDITIONAL GO**: the automated M2 acceptance areas pass on all three supported
hosted OSes, and the Arch wizard passed a real Windows terminal walkthrough.
Use a hard-link-capable local filesystem, keep mutation single-writer, and retain
the documented manual restoration procedure for ambiguous staging bytes. Do not
extend this result to installed AI TUIs, unverified parent shells, Windows ARM64,
network filesystems or power-loss durability. An unconditional claim covering those
environments is **NOT TESTED**, not PASS.
