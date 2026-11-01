# Quality baseline

Starting commit: `b1313eee0ce9dfe5103505650eac706c28fc0db5`, main after PR #15.
Current hardening and exact-head CI: [PR #16](https://github.com/Nickshajtan/hcc-harness/pull/16).
Historical measurements and new first-attempt failures remain separately identified.
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

## Reliability investigation and current enforcement

| Hypothesis                                          | Distinguishing evidence / remaining uncertainty                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arch removal is necessary for executable denial     | Rejected as a necessary condition: raw copy/execute-close/unlink reproduced EPERM without Arch setup, routing or removal.                                     |
| Waiting for direct-child close prevents denial      | Rejected as sufficient: the failed raw attempt recorded exit 0, both stream ends and close before unlink failed.                                              |
| Sandbox restrictions explain the denial             | Both sandboxed and unsandboxed raw failures were captured, along with passing comparisons. Sandbox-only necessity is rejected; denying owner remains unknown. |
| External antivirus/indexer or Windows image sharing | Plausible alternatives, without owner/handle evidence; not established causes.                                                                                |
| Inherited pipes/descendants explain npm help        | No original lifetime trace proves this; explicit direct-child disposal now has a three-second failure budget, without claiming descendant containment.        |
| Slow CIM is a useful critical-path diagnostic       | Rejected: the earlier five-second diagnostic itself timed out; no system-wide enumeration was added.                                                          |

The exact starting checkout's first coverage attempt failed outside the sandbox:
487 passed / 1 failed / 31 skipped. Interrupted three-lane uninstall stress hit
EPERM recreating arbitrary.exe during initialization, after an earlier successful
uninstall. The failed fixture and test/stress reports are retained separately from
the baseline checkout. Sandbox restrictions therefore do not explain the entire
incident family. No owner/cause was established; a later pass cannot close this result.

A confirmed, separate fixture-preparation defect is fixed: failure before world()
returned leaked its root, leaving the caller without a returned cleanup owner.
The new cleanup waits for all sibling directory effects; Promise.all rejection alone
would not establish their completion. A barrier test keeps one sibling pending,
proves cleanup waits, then verifies removal and exact primary error identity. Failed cleanup aggregates
primary and secondary errors in order. This does not causally explain either P0.

The approved setup compound-failure correction preserves both errors through
AggregateError([original, cleanup]), original cause, and unchanged reverse removal
order/stop-on-first-failure. Its regression fails against the old implementation.
No other production behavior, source subsystem, launcher, format or checkpoint changed.

Ordinary warnings are reduced from 52 to 9: unsafe assignment 3 -> 0, unsafe member
access 9 -> 0, unsafe return 2 -> 0, unsafe argument 1 -> 0, non-null assertion
28 -> 0. Seven condition warnings and two nullish-preference warnings remain.
The seven are intentionally accepted teardown guards: beforeAll can fail before a
fixture is assigned despite its declared TypeScript type (including POSIX early
return in the Windows runtime fixture). The two intentionally preserve empty-string
fallback semantics for MISE_BIN/SystemRoot. Replacing them with ?? would change
behavior. No suppression or warning-baseline expansion; newly clean unsafe,
non-null and unnecessary assertion categories now block.

Reliability validation requires all four first-attempt uninstall profiles and 96
complete operations, completed cleanup, and passing help/raw-lifetime/Windows-sharing
assertions in CI's test report. Missing/invalid/truncated/duplicate evidence, failed
children, signals, pending cleanup, pre-iteration failure and report-write failures
fail. Stale PASS output is replaced by FAIL. A scheduled/manual/relevant-PR Windows
job has a ten-minute budget; existing regression and required runtime names remain.

## Current hardening measurements

Pins remain Node 24.19.0, TypeScript 6.0.3, ESLint 10.12.0, typescript-eslint
8.71.2, Prettier 3.9.10, Vitest/V8 5.0.5, Stryker 10.1.1 and dependency-cruiser
18.7.0. Commands are maintained in testing and quality-gates documentation.

Exact starting effect pilot (Windows, 10m24s): setup 59/75, staging 36/44,
recovery 38/39, removal 57/59, planning 47/48; no timeouts or infrastructure errors.
The pristine starting coverage suite failed as recorded above, so it did not
produce a complete numeric coverage baseline. PR #15's 96.05%/93.65% remains a
historical reference, not a fresh successful exact-checkout result.

| Effect module       | Windows before |  Windows after | Hosted Ubuntu after |
| ------------------- | -------------: | -------------: | ------------------: |
| Setup               | 78.67% (59/75) | 90.00% (72/80) |      91.25% (73/80) |
| Staging/publication | 81.82% (36/44) | 93.18% (41/44) |      95.45% (42/44) |
| Recovery            | 97.44% (38/39) | 97.44% (38/39) |        100% (39/39) |
| Removal             | 96.61% (57/59) | 96.61% (57/59) |      96.61% (57/59) |
| Planning            | 97.92% (47/48) | 97.92% (47/48) |      91.67% (44/48) |

Windows after: 255/270 assertion kills, 13 survivors, 2 uncovered, zero timeouts,
errors or exclusions; 6m53s. The approved rollback branch adds five mutants; scopes
were not shrunk. The new guard characterization protects direct metadata-entry
symlinks for setup and uninstall; its final mutation results are recorded in the PR.
POSIX-only chmod branches remain explicitly uncovered on Windows and are exercised
on POSIX. ASCII lower/upper identity normalization and platform-constant branches
have equivalent variants; no mutants are ignored. Remaining phase/case variants
stay visible rather than being declared universally equivalent.

All five full effect files now enforce 85% assertion-only mutation gates based on
these Windows/POSIX measurements. Existing gates are unchanged. Source freshness,
required files, errors/exclusions, and negative survivor/timeout-only tests block
false PASS results. Coverage completeness checks include every production TS file.

The established config/Core/lifecycle/process/CLI gates passed locally. One loaded
intermediate effect run recorded seven timeouts (zero assertion credit); the final
measurement above recorded none. The first sandboxed attempt logged taskkill access
denied during Stryker worker disposal and was interrupted, not counted as PASS.

Latest implementation-commit hosted Ubuntu coverage: 96.38% lines (881/914),
94.30% branches (580/615). Local Windows check passed 500 tests / 32 skips, but the
following coverage run failed 499/1/32 on the raw executable probe: two concurrent
lanes hit EPERM unlink after close, outside the sandbox. Both outcomes are retained.
This disproves sandbox-only necessity for raw denial too, without establishing a
handle owner. A later green job cannot erase that first-attempt result.

Ordinary warnings: 52 -> 9, errors 0. Setup review complexity/length: 15/72 -> 16/78;
the added catch preserves approved failure precedence rather than hiding complexity.
Production dependency graph remains 54 modules / 138 edges, no cycles/violations.
No production modules, dependencies, schemas, launcher bytes or checkpoints moved.
Four legacy signal fixtures now register awaited bounded child disposal through
Vitest completion hooks; primary and teardown failures remain separate test errors.

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
requiring deliberate operator action. The explicitly approved setup rollback change now retains the original failure
first and as AggregateError cause, followed by cleanup failure; removal order is unchanged.
exFAT reconciliation remains unsupported. No alternate publication, automatic
repair or migration was introduced.

## Debt disposition and security

**FIX NOW:** failed-preparation root cleanup; bounded direct-child teardown;
real protocol/prerequisite validation; source-fresh mutation evidence; complete
coverage/reliability reports; metadata-entry symlink, permission and rollback
characterization; the explicitly approved compound setup failure correction.
No public or filesystem policy changed beyond that approved error precedence.

**DEFER / accepted with rationale:** the nine warnings are classified above.
Unknown Windows handle ownership and npm descendants still need causal evidence;
passing stress cannot substitute for it. Hostile filesystem races and generic
event correlation require compatibility/design review. Runtime/bootstrap relocation and migration remain separately authorized B2
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
