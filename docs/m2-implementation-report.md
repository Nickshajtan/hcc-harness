# M2 implementation and validation report

Status: implementation under validation; **no release GO yet**.

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
| Core/EDA/middleware/process contracts | PASS (local) | No source diffs in those modules; existing regression suites pass |
| M1 fixtures before strict invariants | PASS (Windows) | Frozen generator at bfbca214; initial 2 fixture tests passed before parser changes; expanded compatibility suite covers old hashes/paths/order, harness ownership/config edits and recovery |
| Minimal exclusive publication | PASS (Windows supporting filesystem) | Complete live bytes and hard-link count asserted; collisions preserve unknown bytes; unsupported links leave old routes intact |
| Routing reconcile/recovery | PASS (Windows) | Real IPC subprocess termination and CLI resume at journal, staging, exe publication, shim publication, deletion, before/after manifest replacement and cleanup |
| Manifest replacement | PASS (Windows supporting filesystem) | Real replacement during reconciliation/recovery; injected sharing failure retains old bootstrap and journal for retry |
| Installation versus activation | PASS (local) | Init without mise succeeds; status reports valid installation independently of PATH/mise observations and never claims verified parent-shell activation |
| Legacy uninstall / new deinit | PASS (local) | Existing unattended uninstall regressions unchanged; deprecation notice; deinit non-TTY refusal, --yes removal, simulated default-No/cancellation |
| Deterministic wizard equivalents | PASS (local) | Injected defaults/custom names/cancellation/configuration/removal; init/configure explicit sets, status and deinit --yes CLI integration |
| Full local automated validation | PASS | Final local npm run check: typecheck, lint, build; 15 files, 116 passed, 3 platform skips (119 total), zero failures |
| Ubuntu/macOS/native-Windows hosted matrix | NOT TESTED for M2 yet | Workflow includes all M2 suites and per-platform JSON artifacts; run links to be added after execution |
| Real terminal wizard / installed AI TUI smoke | NOT TESTED | Simulated interaction and real native fixture processes do not establish real AI TUI compatibility |
| ARM64 / network filesystems / power-loss durability | NOT TESTED | Outside measured platform/filesystem coverage |

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

M2 run links pending. The historical
[M1 corrective run](https://github.com/Nickshajtan/hcc-harness/actions/runs/38829564913)
is background evidence only and is **not** an M2 pass. The local GitHub CLI credential
is invalid; the connected GitHub account is available for submitting the validation
branch. No M2 hosted result is claimed until its run is inspected.

## Recommendation

**NO-GO for a completed cross-platform acceptance claim while the M2 matrix is
pending.** Local automated results support the implementation on the measured
Windows filesystem. Real-TTY/manual and unmeasured-platform limits must remain
explicit even after hosted automated validation passes.
