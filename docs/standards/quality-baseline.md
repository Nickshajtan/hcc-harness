# Quality baseline

Starting commit: `e875ddc18eea553d7356f39bae5023cfab1d25c7`, main after PR #14.
Current measurements and exact-head CI: [PR #15](https://github.com/Nickshajtan/hcc-harness/pull/15).
Human Comprehensibility First remains the review criterion; metrics do not establish stability.
M2.2 B2 is not implemented or authorized.

## Acceptance and operational incidents

Structural completion and stability acceptance are independent. The installation
boundary is explicit; **stability acceptance remains UNRESOLVED and B2 is NOT READY**.

**Uninstall: UNRESOLVED, critical.** The older Windows uninstall exit 1 and later
interrupted-uninstall exit 1 were not causally explained. Current runs captured
EPERM unlinking an owned `arbitrary.exe` after native close, with its uninstall
journal retained. Other runs captured EPERM recreating it after successful removal.
Do not assume these observations share a cause. The denying process/handle or
condition remains unidentified; sandbox/unsandboxed correlation is not causation.

The retained failing fixture was subsequently inspected as recovery_pending with
valid recorded ownership. Explicit uninstall completed with exit 0, leaving it
uninitialized and preserving edited middleware. Original journal/results were
copied first. This proves recovery for that occurrence, not its cause or universal
containment. The existing real Windows no-delete-sharing test still verifies
refusal, retained ownership and recovery after the holder releases its handle.

Sequential/concurrent stress uses independent roots: four cycles with one and
three lanes, in fresh and interrupted-removal modes (32 sequences per complete run).
Every first-attempt result matters. External reports retain stage, paths, streams,
code/signal and cleanup outcome; failed fixtures remain. A direct-native
copy/execute-close/unlink probe passed 32 cycles across project and system-temporary
roots. Repeated success does not close the incident.

**Windows npm help: UNRESOLVED, critical.** The
[original failed run](https://github.com/Nickshajtan/hcc-harness/actions/runs/41147708309)
timed out during linked/direct/PowerShell help, followed by cleanup EBUSY. The pending
phase/owner was not captured; no connection to uninstall is established. Current
diagnostics record phase, PID, spawn/exit/stream-end/close events, partial streams
and completed results before teardown. Descendant/handle ownership remains a gap.
A pipe-inheritance experiment did not validate its proposed Windows mechanism.

An optional CIM family-observation enhancement failed in
[Windows CI](https://github.com/Nickshajtan/hcc-harness/actions/runs/41209773783):
PowerShell exceeded its five-second diagnostic budget. The enhancement and its new
test were withdrawn together; no existing assertion was relaxed or timeout raised.
Local loaded runs also retained recovery checkpoint timeouts. These failed results
are not erased by later green runs. No production retries, sleeps or speculative
operational repair were introduced.

A new case-identity test also had a confirmed portability defect:
[macOS failure](https://github.com/Nickshajtan/hcc-harness/actions/runs/41226036970).
It assumed every POSIX volume was case-sensitive. The unchanged planner correctly
refused an uppercase alias on the runner's case-insensitive filesystem. The test
now observes that capability and asserts the corresponding existing no-clobber
behavior, including unchanged manifest bytes. No platform skip or product change.

## Reproduced quality

Pins unchanged: Node 24.19.0, TypeScript 6.0.3, ESLint 10.12.0,
typescript-eslint 8.71.2, Prettier 3.9.10, Vitest/V8 5.0.5, Stryker core/runner
10.1.1 and dependency-cruiser 18.7.0. No dependencies or lockfile changes.

The exact baseline was built/tested in an isolated checkout with native exit status
captured directly: 456 passed, 31 explicit skips, exit 0. Coverage-on-failure was
enabled for observation, never to change test status. Earlier sandboxed baseline
runs failed with EPERM and remain retained.

| Measurement                           |  Starting commit | Measured implementation, Windows |
| ------------------------------------- | ---------------: | -------------------------------: |
| Lint errors / ordinary warnings       |           0 / 55 |                           0 / 52 |
| V8 lines                              | 94.95% (866/912) |                 96.05% (876/912) |
| V8 branches                           | 91.86% (565/615) |                 93.65% (576/615) |
| Setup complexity / review length      |          15 / 72 |                          15 / 72 |
| Production dependency modules / edges |         52 / 130 |                         54 / 138 |
| Dependency violations / cycles        |            0 / 0 |                            0 / 0 |

Setup's coordinator complexity was not hidden or reduced: rendering now has a
separate resource responsibility, and planning no longer imports installation
coordination. No classes, containers, transaction framework or global execution
state were added. Latest exact-head counts/timings are in the PR, not extrapolated
between operating systems or treated as performance benchmarks.

Measured Windows line/branch coverage: renderer 100/100, setup 97.5/90,
planning 100/100, staging/publication 95.23/93.33, recovery 100/100, removal 100/100.
These six scopes enforce 95% lines / 90% branches after Windows and hosted Ubuntu
measurement. All prior gates remain. Thin CLI/readline subprocess V8 gaps remain
visible; real CLI, native, interruption and terminal tests remain separate evidence.
No production source was excluded.

## Mutation measurements

Scores are assertion-only; timeouts earn zero assertion credit. No ranges,
mutators or difficult branches were excluded. Existing five pilot gates remain.

| Windows scope                      | Killed / total | Survived / uncovered / timeout |
| ---------------------------------- | -------------: | -----------------------------: |
| Config                             |          87/93 |                      1 / 0 / 5 |
| Core + middleware/events           |        219/229 |                      6 / 2 / 2 |
| Lifecycle validation               |        383/397 |                     10 / 2 / 2 |
| Process                            |        301/313 |                     11 / 1 / 0 |
| CLI/Wizard                         |        444/458 |                      7 / 2 / 5 |
| Effect pilot, first measurement    |        198/265 |                   34 / 17 / 16 |
| Effect pilot, hardened measurement |        233/265 |                     30 / 2 / 0 |

The hardened effect measurement is 87.92% overall: recovery 97.44%, removal 96.61%,
planning 93.75%, staging/publication 81.82%, setup 76%. Later assertions also cover
case-preserving plans, equal-size route mismatches, exact resources beside
preexisting middleware and POSIX executable/metadata modes. Latest remeasurement
is reported by platform in the PR rather than inferred.

Survivor review exposed genuine gaps in direct validation, pending-operation and
foreign-platform refusal, late ownership modification, private-stage/initial
exclusive-create races and cleanup diagnostics. Real-file tests now protect them.
Remaining permission mutants require POSIX evidence; case-normalization and repeated
path guards include platform-equivalent/redundant variants. None are ignored.
Full reports retain every survivor, uncovered mutant, timeout and error count.

The first effect pilot cost 16m45s under concurrent Windows load; the later pilot
took 8m14s. Its separate relevant-change/scheduled/manual CI job preserves the
established job's 15-minute budget. New per-file 85% targets remain advisory:
setup/staging have not earned numeric gates. Reporting requires all five complete
scopes and rejects missing/error/ignored evidence. Measurement success explicitly
does not imply every advisory target is met.

## Responsibility and filesystem review

Core owns execution sessions/failure precedence; Process owns native resolution
and direct-child cancellation. Their implementations are unchanged. Installation
setup coordinates exclusive creation/rollback; rendering reads vendor resources
without inspecting project state. The setup facade preserves every public export.
Explicit CLI/vendor anchors retain exact generated bytes in source and built
output, including x64/ARM64 assets. ARM64 byte comparison is not execution evidence.

Lifecycle alone owns recorded hashes, manifests, plans, journals, recovery and
removal. Planning imports rendering directly; uninstall has one authoritative
implementation. Recorded hashes, never current renderer output, prove ownership.
CLI/Wizard remain workflows over those operations. Configuration, middleware and
events retain their contracts. Compatibility facades remain required public paths.

Filesystem review preserves validated paths, symlink refusal, hash checks,
exclusive publication, owned manifest replacement and exact checkpoint/cleanup
ordering. Fault tests cover pre-publication failure, partial writes, late collisions,
modified obsolete bytes, removal/replacement/cleanup failure and explicit idempotent
recovery. Real forced-interruption tests and frozen M1 fixtures remain intact.

Limits: one mutator per project; no hostile-race lock, atomic route-set switch or
power-loss durability claim. Ambiguous stages and pre-journal orphans are preserved,
requiring deliberate operator action. Initial rollback cleanup failure retains its
characterized precedence over the original write error; changing it needs review.
exFAT reconciliation remains unsupported. No alternate publication, automatic
repair or migration was introduced.

## Debt disposition and security

**FIX NOW:** installation/renderer ambiguity; three status JSON boundaries narrowed
to unknown; warning fingerprints pruned; shared process capture distinguishes exit
from close; external stress evidence survives cleanup; effect reports require every
scope. Source behavior remains unchanged.

**DEFER:** remaining 52 warnings mix B1/protocol fixture lifetimes, unsafe external
JSON/matcher typing and intentional empty-string fallbacks. They need individual
protocol characterization, not replacement casts. Rollback error precedence,
hostile filesystem races and generic event correlation need explicit compatibility
review. Runtime/bootstrap relocation and migration remain separately authorized B2
work. Critical incident diagnosis takes precedence over further cosmetic changes.

**REJECT:** speculative retries/sleeps, inflated timeouts, unproven CIM/pipe approaches,
automatic repair, broad suppressions, unsafe dependency overrides, generic installers
and uniform directory moves without responsibility value.

Audit reports **15 moderate development-only entries**, zero high/critical;
production-only audit reports zero. Chains include Stryker -> typed-rest-client ->
pinned qs and ESLint/typescript-eslint -> minimatch 10.x. Registry inspection found
Stryker 10.1.1 and no newer compatible typed-rest-client 2.x; minimatch 10.2.6 remains
below the advisory's fixed 11.0.1 range. No forced major change or override.
This is not a clean full audit.

Windows ARM64 execution, every terminal emulator, real AI TUIs, real nvm/fnm,
hostile races and hardware power-loss recovery remain NOT TESTED. Required runtime
jobs retain zero silent skips and the exact aggregate name. Keep failed-run links
alongside successful exact-head CI. B2 cannot be READY while a critical incident
remains unexplained.
