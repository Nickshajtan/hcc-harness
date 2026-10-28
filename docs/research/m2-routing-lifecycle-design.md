# M2 setup wizard and routing lifecycle design

Status: Stage A revision approved; Stage B authorized by the user. This document
records the approved design. Implementation evidence is tracked separately in
`docs/m2-implementation-report.md`.

## Scope and evidence

Inspected `src/cli.ts`, `setup.ts`, `core.ts`, `process.ts`, `config.ts`,
`middleware.ts`, README, architecture/testing documentation, uninstall unit tests,
test fixtures, and the existing three-platform CI workflow.

Observed: setup already renders project-local launchers, creates files exclusively,
records hashes, rolls back ordinary failures, and validates repeated initialization.
Uninstall renames bootstrap ownership to a recovery checkpoint before deleting.
The middleware configuration ownership flag is separate from managed routing files.
Native resolution already strips marked router directories and rejects realpath
aliases to them. No execution or middleware API changes are needed.
Core, EDA/event-bus contracts, middleware contracts and native process execution
remain unchanged throughout this milestone.

Observed gaps: manifest parsing permits incomplete resource sets; route names must
currently be inferred from filenames; setup compares map serialization order;
there is no routing transaction, status service, discovery adapter, or prompt layer.
Setup rollback handles caught failures, not arbitrary process termination.

## Proposed organization

- Keep `setup(root, commands)` and programmatic `uninstall(root)` compatible.
- Extract shared command validation, launcher rendering, manifest parsing, ownership
  checks, and route inference from setup without changing launcher behavior.
- Add deterministic lifecycle inspection, route planning, reconciliation and recovery.
- Add discovery using `nativeEnvironment()` and `resolveExecutable()`; never launch
  candidates. Keep the known catalogue separate from routing logic.
- Add a thin injectable terminal adapter using Node readline, with no dependency.
  It returns selections/confirmation; only lifecycle services mutate files.
- Keep the dispatcher and core execution path unchanged. Help lists public commands;
  the internal `run` syntax remains supported.

Operations target the resolved current working directory, as existing setup does.
They do not search ancestors and accidentally mutate a parent installation. Runtime
middleware discovery retains its existing nearest-ancestor behavior.

## CLI and interaction

`init <commands...>` remains explicit and prompt-free. Bare `init` opens the wizard
only when stdin and stdout are TTYs; otherwise it errors with explicit-command
guidance. It no longer silently chooses claude/codex in CI.

`configure` opens a TTY menu: update routes, inspect, deinitialize, cancel.
Add `configure <commands...>` as the documented non-interactive desired-set operation.
`route add/remove <commands...>` are prompt-free; additions are idempotent, as are
removals of absent names, provided at least one route remains. `route list` and
`status [--json]` are read-only. Reject unknown flags and excess arguments.

`deinit --yes` authorizes removal without prompts; otherwise show a plan and ask
in a TTY, defaulting to No. Outside a TTY, require `--yes`, including during recovery.
`uninstall` remains a deprecated compatibility alias with its existing prompt-free
behavior in both TTY and unattended use, including recovery and repeated removal.
Accept `uninstall --yes` too, but never require it. Emit a concise deprecation notice
on stderr recommending `deinit --yes` for automation; keep stdout and success/failure
semantics compatible. Both entry points call the same ownership-checked service.
Programmatic uninstall is unchanged. This explicit user-approved exception supersedes
the spec's general unattended-confirmation rule for the legacy alias only.

Wizard selection uses numbered choices and explicit custom-name entry rather than
requiring cursor-control widgets. Show project root, installed/missing candidates,
current routes, native fallback, preservation rules, and a final summary. Default
fresh selections are installed claude/codex; other tools remain optional. If neither
is installed, start empty and require a choice or cancellation. Existing selections
default to current routes. Validate custom names through the same service; Windows
identity is case-insensitive. EOF, Ctrl+C, and cancel before applying write nothing.
Report managed paths and mise trust/prompt-refresh instructions after success.
Say “Arch installed for this project. Shell activation has not been verified.”
Never announce that commands are now routed solely because setup succeeded.

Exit codes: 0 for success or deliberate cancellation, 1 for operational/state
failure, 2 for invalid usage or missing non-interactive decisions, 130 for SIGINT
during interaction. Dispatcher exit/signal propagation remains unchanged.

## Derived installation states

| State | Evidence | Allowed mutation |
| --- | --- | --- |
| UNINITIALIZED | No bootstrap or operation journal | Init after collision checks |
| INITIALIZED | Valid complete bootstrap and matching managed files | Reconcile or deinit |
| RECOVERY_PENDING | Valid uninstall or routing journal, consistent with its checkpoint | Resume the recorded operation; deinit may finish routing recovery first |
| INVALID_STATE | Malformed/conflicting state, changed files, or unexplained missing resources | None; report affected paths and restoration guidance |

Bootstrap plus routing journal is expected during reconciliation; bootstrap plus
uninstall journal remains invalid. Routing plus uninstall journal is invalid.
Status never performs recovery. A routing journal with inconsistent files is invalid,
with `recoveryPending: true` and explicit diagnostics rather than a healthy state.

Do not add a persistent state enum. Infer routes from validated platform launcher
sets, checking marker/mise presence, executable/shim pairs, valid names, reserved
names, and Windows case collisions. Continue reading existing bootstrap manifests;
do not silently accept structurally incomplete manifests as healthy installations.
Middleware edits do not invalidate routing integrity. Report malformed middleware
configuration separately; reconciliation never parses and rewrites it.

### M1 compatibility gate

Existing M1 manifests have no schema, route list, runtime version, or platform field:
only `files` and `createdHarness`. Do not require new fields, current launcher
templates/hashes, current runtime paths, insertion order, or unchanged harness text
to recognize a valid M1 installation. Validate recorded hashes against actual bytes.
Infer names using the installation's launcher layout; a foreign-platform layout
should remain inspectable/removable even if reconciliation on this host is refused.

Before enabling stricter completeness checks, Stage B must capture fixtures from
the unchanged M1 generator on Windows and POSIX, then run those same fixtures against
the proposed parser. Cover one/multiple/custom commands, accepted mixed-case names,
both `createdHarness` values, modified/pre-existing/missing harness configuration,
reordered JSON properties, and old captured checkout/runtime paths. Windows exe/shim
pairs and POSIX extensionless launchers must both be represented. Also capture an
M1 uninstall checkpoint with some files already removed: recovery permits those
absences without weakening fresh-bootstrap integrity checks.

Separate format/ownership parsing from healthy-installation completeness checks.
M1's parser accepts some objects its generator never emits (for example an empty
`files` map). These are not evidence of a complete installation: report diagnostics
and refuse reconciliation, but do not unnecessarily block legacy ownership-safe
uninstall solely because the new route inference cannot derive a complete set.
Unsafe paths, invalid hashes, conflicting journals and modified remaining owned
files still fail. Any fixture produced by valid M1 setup that the new parser rejects
blocks enforcement until the invariant is corrected or explicitly reviewed.

Evidence at this revision: inspected the unchanged generator, parser and existing
uninstall/integration tests; they cover generated/pre-existing harness ownership,
custom commands, repeated init and partial uninstall. No stricter parser exists yet,
so compatibility against it is a required pre-enforcement test, not a claimed pass.

## Routing plan and recovery protocol

The bootstrap manifest cannot explain both old and new resources after interruption.
Introduce one versioned `.arch/routing.json` journal containing validated old and
desired ownership manifests, exact new-launcher payloads, and bounded staging paths.
Preserve `createdHarness` verbatim. Never store environment values or credentials.
Unchanged routes retain their exact bytes and hashes, including captured runtime
paths; adding a route does not implicitly upgrade existing launchers.

Before mutation, validate the complete old ownership set and desired nonempty route
set, preflight additions (including zero-length files, directories, and symlinks),
and compute additions/removals. Reject changes to the router marker/mise integration.
No-op plans write nothing. Reject detectable competing journals; recheck bootstrap
identity immediately before starting. Concurrent writers are unsupported and must
be documented; do not claim an interprocess transaction or protection from hostile
filesystem races.

### Publication alternatives and decision

| Failure/boundary | Journal + staged rename | Journal + exclusive hard-link publication |
| --- | --- | --- |
| Interrupted staging write | Live target untouched; preserve partial stage | Same |
| Destination appears after preflight | Ordinary rename can replace it; a second existence check still races | Link fails if destination exists; do not overwrite |
| Completed publication, crash before bookkeeping | Journal plus target hash permits replay | Same; stage and target may both remain |
| Windows open executable/sharing denial | Rename may fail; retain checkpoint and retry | Link/deletion may fail too; retain checkpoint and retry |
| Cross-filesystem publication | Rename can fail; use sibling staging | Link can fail; use same-filesystem staging |
| Filesystem capability | Rename is more widely supported | Hard links require support; no automatic unsafe fallback |

Ordinary Node filesystem rename is not a portable “rename only if absent” operation.
Staged rename is simplest for replacing the already-owned bootstrap, but cannot
preserve exclusive creation for a newly added launcher if a destination appears
between preflight and publication. A journal explains interrupted ownership; it
does not authorize replacing the newly appeared file. Documenting single-writer
use does not justify removing M1's existing no-clobber creation guarantee.

Decision: retain hard links only for publication to previously unowned paths
(new launchers and the new journal); use staged rename for the owned bootstrap.
Use one small exclusive-publication helper rather than a general transaction layer.
The extra unlink of the stage is the concrete additional cost. Pure staged rename
is rejected for new destinations, not for owned-state replacement. Exclusive copy
avoids clobbering but can expose a truncated live launcher when interrupted, so it
does not provide an equivalent simpler replacement.

These are intended local-filesystem guarantees, not established results on all
supported platforms. Before Stage B publication code is accepted, test destination
collision, complete bytes after interruption, hard-link support and failure behavior
on native Windows/NTFS and hosted Ubuntu/macOS filesystems. Do not infer atomicity
on network/cloud-backed filesystems or power-loss durability. Unsupported links
must fail before live changes and leave existing routes usable. Existing M1 setup
and uninstall need not acquire a hard-link dependency merely to support M2 routing.

Use the following roll-forward protocol:

1. Persist a complete journal before modifying live launcher paths. Publish journal
   content only after a complete exclusive staging write, using an exclusive hard
   link to avoid replacing an existing journal. Keep staging names bounded and
   specific to the operation, never discover/delete files by a broad wildcard.
2. Write additions into private, journal-recorded staging files, set POSIX execute
   permissions, and publish each completed file with an exclusive hard link. This
   avoids a partially written live launcher and never overwrites a collision.
3. Verify all additions and retained files before removing any old launcher. Remove
   only matching old hashes. The mise file and router marker remain throughout.
4. Write the desired bootstrap to a recorded temporary sibling and rename it over
   the old bootstrap after checking old identity. On supported local filesystems
   this provides an atomic manifest replacement; do not unlink the old manifest
   first as a Windows workaround. A sharing/rename failure retains the journal.
5. Verify the final ownership set, clean only verified staging resources, then
   delete the journal last.

Recovery validates the entire journal and all live files before further mutation.
Retained resources must exist and match. Added files may be absent or match new
hashes; removed files may be absent or match old hashes. Bootstrap must equal old
or desired state. Any other content blocks recovery without deletion. Resume the
same plan idempotently, using recorded payloads rather than current runtime paths.
A retry with a different desired set is refused until the recorded update finishes.
`configure <recorded-desired...>` or the configuration wizard can resume the plan;
`deinit --yes` (or legacy `uninstall`) first finishes routing recovery, then uses normal uninstall recovery.
Status prints this guidance and the pending desired routes.

Stage writes must be checked explicitly in fault tests: a partial private staging
file can be left by termination. Preserve it with an actionable diagnostic rather
than guessing ownership from a filename or deleting mismatched bytes. The journal
records enough data to restore its expected contents manually and resume. An
interruption before journal publication may leave an unreferenced staging file;
it has no live routing effect and must not be automatically deleted. Report any
collision involving the fixed publication staging path. This is safe recoverability,
not automatic repair of ambiguous ownership or full filesystem transactionality.

Hard-link publication requires a filesystem supporting hard links. Fail with a
clear diagnostic on unsupported filesystems before changing live routing; do not
fall back to overwrite-prone rename publication. Validate on NTFS and hosted POSIX
filesystems. Power-loss durability/fsync guarantees are outside this milestone.

Windows additions/removals operate on exe/shim pairs. Both additions are prepared
before old routes are removed; process crashes can expose a partially published
new pair, but recovery completes it. Shared routes remain usable throughout. There
is no claim that arbitrary external command invocation sees an atomic route-set
switch. A directory swap would be substantially more disruptive and would replace
unrelated files under `.arch/bin`.

## Initialization, removal, and ownership boundaries

Keep existing initialization rollback and uninstall checkpoints. Extend collision
checks to distinguish absence from empty content and refuse symlink resource paths
and symlinked managed parent directories before mutations. Never recursively delete
directories. A fresh initializer interrupted before its bootstrap publication can
still require manual inspection of orphan files; document this existing boundary
rather than claiming the routing journal repairs arbitrary incomplete setup.

Generated default harness configuration is removed only if still byte-identical;
modified or pre-existing configuration survives. Routes never write it. Native
installations and unrelated project files are never owned by these manifests.

## Discovery and status

Return candidate command, available flag, and optional resolved executable path.
Distinguish installed known tools, absent known tools, and custom selections.
Use existing platform PATH/PATHEXT resolution and router filtering. Missing tools
are suggestions only, not validation failures for explicit routes. Resolution does
not establish that arbitrary Windows batch scripts are supported: label discovery
as presence, retaining the existing execution contract. Filesystem errors become
diagnostics rather than being silently reported as missing commands.

Status JSON schema 1 includes resolved projectRoot, lowercase state, routes,
integrity, recoveryPending, pending operation/desired routes where applicable,
managed path diagnostics, mise presence/PATH activation observations, and warnings.
Do not emit raw environment values. Report mise absence without blocking setup;
PATH presence is an observation, not proof of shell activation or project trust.
Text output adds concrete next commands. JSON output contains no surrounding text.
Invalid state returns diagnostic JSON and a failing exit code; uninitialized is a
normal successful inspection. Route list refuses invalid/recovery state rather
than presenting a partially applied set as effective configuration.

Installation and activation are separate dimensions. `state: initialized` means
owned routing resources are valid on disk, even with mise absent or the project bin
missing from PATH. Expose `activation` separately with `miseAvailable`,
`projectBinOnPath` and `shellActivation: unknown`; use unknown when an observation
cannot be made. Do not collapse these observations into an `active: true` boolean.
An Arch child process cannot establish its parent shell's hooks, aliases, functions,
trust decisions, or refreshed environment from PATH alone. Route list reports
configured routes and labels them accordingly, rather than promising shell resolution.

Text diagnostics show installation health first, followed by activation observations
and instructions: install/activate mise if needed, refresh the prompt, trust the
project when prompted, or use `mise exec -- <command>`. Deinit reports removal of
project routing resources and advises shell refresh; it does not promise the parent
shell has already refreshed. README and architecture/testing docs must use this
distinction consistently, including examples with successful init but inactive PATH.

Required tests independently vary valid installation, mise presence and project-bin
PATH presence. Assert initialization succeeds with no mise, status stays initialized
when activation is absent/unknown, PATH presence never claims verified shell routing,
and initialization stdout never claims activation. Keep a separate actual mise-exec
integration test proving routing for that subprocess only; manual shell smoke tests
provide separate activation evidence.

## Rejected alternatives and risks

- Uninstall/setup loses continuity and configuration ownership; rejected.
- In-place bootstrap rewrite or launcher writes leave torn live files; rejected.
- Bootstrap alone cannot explain partial additions/removals; rejected.
- Rebuilding every launcher can change captured runtime paths unnecessarily; rejected.
- Automatic deletion of unexpected files is unsafe ownership repair; rejected.
- General locking framework and automatic stale-lock eviction add ambiguous crash
  semantics. Exclusive operation journals and documented single-writer use suffice
  here, without claiming complete concurrency isolation.
- A new prompt dependency is unnecessary for the specified interaction.

Main risks are Windows link/rename permissions, manifest validation compatibility,
partial private staging writes, and stale shell PATH. Legacy unattended uninstall
behavior is deliberately retained, with deprecation guidance rather than a new gate.
Tests must establish their behavior before implementing the public mutations.

## Implementation and validation order after approval

1. Add planning/state/manifest unit fixtures and fault-injection cases first.
2. Extract shared setup primitives; retain existing regression tests.
3. Implement routing journal publication, recovery, reconciliation and inspection.
4. Implement discovery, strict CLI parsing, and injectable interaction adapters.
5. Update README, architecture/testing docs and write an evidence-based M2 report.

Unit tests: validation/reserved names/duplicates/platform case rules; complete and
malformed manifests; all derived states; deterministic plans; default/custom
selection; discovery without execution/router recursion; cancellation/EOF/signals;
non-TTY usage; JSON status; byte-preserved middleware configuration.

Fault tests must interrupt before/after journal publication, staging writes,
each Windows pair member, each removal, bootstrap rename, cleanup and journal
removal. Assert retries and deinit recovery, journal conflicts, missing retained
files, mismatched remaining files, unknown collisions, symlinks, permission errors,
unsupported hard links and Windows replacement failures. Never accept arbitrary
missing files outside the recorded recovery plan.

Integration tests: fresh/repeated init, add/remove/replace/no-op/final-route refusal,
configuration and native binary preservation, project isolation, native fallback,
deinit/reinit, both interrupted mutation types and refusal cases. Retain unattended
uninstall invocations without `--yes` as compatibility regressions, including recovery,
ownership refusal and idempotency. Add separate tests for deinit's default-No TTY
confirmation, cancellation without writes, non-TTY refusal without `--yes`, authorized
removal with `--yes`, and the alias deprecation diagnostic. Retain programmatic tests.

Run `npm run check` locally and the existing Ubuntu/macOS/Windows CI matrix. Report
only platforms actually run; local Windows success does not establish hosted
matrix completion. Extend the existing manual real-TTY checklist for selection,
custom entry, cancellation, confirmations, reconfiguration and shell refresh.

Recommendation: CONDITIONAL GO for implementation after approval. The execution
architecture fits the milestone; acceptance depends on fault-injection evidence
and the supported-platform matrix. Stage A has changed documentation only and
does not claim any M2 feature or new test is implemented.
