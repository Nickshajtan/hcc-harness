# Quality baseline

## M2.2 B2 stable runtime baseline

Starting main: `78aeb389ea9af7d09d97e91298b20bbdffe1d6f9` (PR #17 merged).
The inspected [baseline quality run](https://github.com/Nickshajtan/hcc-harness/actions/runs/41446920283)
reported Ubuntu coverage **96.39% lines / 94.30% branches** (915 lines, 615
branches); these are hosted Ubuntu measurements, not a reproduced Windows baseline.
PR #17's inspected Windows/Ubuntu/macOS regression and portability jobs passed,
including the required aggregate. Ordinary warnings reproduced at zero.

B2 adds explicit stable installation, a readiness boundary, independent runtime
entrypoints and a pre-import engine guard. Core, process, lifecycle/journal,
middleware/event APIs and historical ownership bytes are unchanged. New stable
launchers intentionally reference the completed snapshot; development rendering
retains its frozen bytes. No migration/rebind or real AI CLI integration was added.
See the [installation contract](../runtime-portability.md#stable-installation-contract).

The public command is tested from an isolated source/build tree, including Windows
native compilation, into a separate destination with spaces, Unicode, apostrophe
and `&`. npm's initial compound script incorrectly applied batch escaping to
arguments consumed by the final Node command on Windows. Its standard
`preinstall:stable` hook now owns build preparation; `install:stable` is a single
Node invocation. The unchanged destination passes the regression. No custom shell
installer was introduced. Native CLR stdin output is compared with direct native
execution, preserving its encoding policy rather than imposing Arch's encoding.

Local Windows evidence includes real installer interruption at reserved,
materialized, verified and published barriers; a complete source rename and
fixture-owned historical Node deletion/replacement; recorded resource hashes;
native npm runtime isolation; Ctrl+C/Ctrl+Break, cleanup and child termination.
Local complete check PASS: 574 tests / 32 existing explicit skips, 24 quality-tooling
tests, zero ordinary warnings, and no dependency violations (60 modules / 152
dependencies). The final stable command suite separately passed 37 tests, including
the strengthened process-completion races and byte-exact configuration assertion.
Final hosted conclusions belong to the implementation PR; do not infer platform
acceptance from local Windows scenarios alone.

Current Windows coverage PASS: **95.02% lines / 92.91% branches** (1026 lines / 692
branches), 574 passed / 32 existing skips. Reporting-on-failure was enabled for
diagnostic completeness; exit semantics/assertions/thresholds were unchanged.
New modules: runtime-version 100%/100%, stable-layout 100%/94.44%, stable-install
97.61%/89.58% line/branch; renderer 100%/100%. The new installer branch target is
not fully reached on Windows. CLI/bootstrap entrypoint subprocess coverage is
separate from V8 worker coverage; zero entrypoint counters do not mean those
contracts were untested. Baseline Ubuntu versus current Windows totals are not a
same-platform regression comparison. The current reliability validation PASS
requires all four profiles / 96 operations plus the passing suite report.

**Retained first-attempt failure:** intermediate coverage ran 566 passed / one
failed / 32 existing skips. Raw executable recreation hit EPERM at
`tests/integration/native-lifetime.test.ts:75`, without Arch removal. Evidence:
`.test-state/b2-coverage.log`, `.test-state/b2-coverage-first-attempt.json`,
`reports/native-lifetime/e0ed49b0-a90b-4fd1-bae7-36cbf15c5e3a.json` and retained
fixture `arch-fixture-R1voi8`. This is not erased by later passing checks. A later
coverage run recorded 570 passed / three failed / 32 skips: an NTFS recovery
checkpoint timeout at `staged:.arch/bin/gemini.shim`, EPERM recreating
`arbitrary.exe` in the workspace-based interrupted/uninstall profile, and a new
vendor-directory fixture that was incorrectly empty (fixed by adding a real
payload so the intended directory-type refusal is exercised). That run and its
reliability rejection are retained in `.test-state/b2-final-test-coverage.log`,
`.test-state/b2-final-coverage-first-attempt.json` and
`.test-state/b2-final-test-coverage-evidence/5719e82e-ee09-49ad-b87e-ab680f9524d0.json`.
The checkpoint timeout remains unexplained; it is not attributed to exFAT.
Direct OS drive information identifies this checkout's `D:` as exFAT and temporary
`C:` as NTFS. This supports the independently observed workspace hard-link/symlink
capability failures, not an explanation for all executable or recovery failures.
The
Windows executable-access and npm-help incidents both remain **UNRESOLVED**;
no antivirus attribution, exclusion, production retry or sleep was introduced.

Development dependency audit executed with Node's system CA trust after the
host's default registry trust failed. Production audit: **0 vulnerabilities**.
Full audit: **15 moderate development-only entries**, through the existing
Stryker/typed-rest-client/qs and ESLint/minimatch trees. Direct affected tooling
reports no available fix; no forced overrides or unrelated major upgrades were
applied. Installed snapshots omit development dependencies and lifecycle scripts.

### Complete complexity review

The maintained [per-finding inventory](complexity-inventory.json) contains both
measurements, source locations/symbols, metric/value/threshold, correctness and
maintenance risks, recommendations, decisions/rationales and test references.
Generate diagnostics with `npm run lint:report` (`reports/lint.json`); no source
exclusions or thresholds changed. Review severity is priority, not a confirmed
defect or an incident-resolution claim.

| Metric              | Before | After |
| ------------------- | -----: | ----: |
| Complexity >12      |     13 |    15 |
| Nesting >3          |      8 |     8 |
| Parameters >4       |      3 |     3 |
| Function length >60 |     19 |    21 |
| Total               |     43 |    47 |

No findings were removed or hidden. All four new findings are ACCEPT: stable
metadata guards (15 branches), runtime evidence completeness (15 branches), the
real interruption scenario (97 lines) and the complete source-relocation scenario
(67 lines). Their independent safe-refusal checks and complete fixture lifetimes
are clearer together. The inventory groups all remaining findings by module and
severity: 39 ACCEPT, eight DEFER, zero metric-driven FIX NOW changes. Deferred
items require coordinated contract/resource-ownership work; they were not simply
classified by file size.

Top five maintenance priorities remain:

1. Reliability validator/report orchestration: false-green risk; preserve the
   negative evidence matrix before considering smaller named validators.
2. Shared `world` fixture preparation: compiler, environment and resource ownership
   coupling; separate only with caller and cleanup characterization.
3. Existing project setup: collision/proof/write/rollback precedence; a dedicated
   filesystem change must preserve historical hashes and failure identity.
4. CLI grammar: 27 branches for public variants; reconsider command-specific
   syntax operations only with a grammar change, without a generic command bus.
5. Terminal helper coordination: bounded waits, listeners and disposal; evaluate
   ownership during a dedicated PTY change, not a cosmetic extraction.

### New mutation scope and measurement limits

`npm run test:mutation:stable` mutates complete runtime-version, stable-layout and
stable-install sources. `test:mutation:check` verifies their nonempty current-source
reports and rejects infrastructure errors/exclusions. Existing numerical gates are
unchanged; the new effect pilot's proposed 85% assertion-only target is not yet a
blocking threshold. Timeouts never earn assertion credit. New production files
remain in coverage and dependency analysis; CLI subprocess instrumentation limits
remain explicit. The final pilot and coverage numbers must be read at the final
implementation commit, not inferred from an earlier source revision. Final local
Windows pilot: 285 mutants, 238 killed, two timeouts, 38 surviving, seven uncovered,
zero errors/exclusions; 84.21% timeout-inclusive, **83.51% assertion-only**, 224
seconds including bootstrap build. Per-module assertion scores: runtime-version
100% (22/22), stable-layout 87.04% (47/54), stable-install **80.86%** (169/209).
The installer remains below the proposed 85% target; numerical adoption is deferred
instead of shrinking scope or giving timeouts assertion credit. All existing
mutation commands and current-source gates executed successfully; the effect
pilot's separate validator also enforces its unchanged 85% per-file thresholds.

Initial pilots exposed real test gaps in ancestor symlinks, npm safety flags,
completion collisions and metadata narrowing; targeted tests now cover them.
Remaining pilot gaps include platform-specific permissions/entry selection,
nonregular-resource refusals, defensive malformed package states, some bounded
subprocess option changes and diagnostic-only mutations. Detailed status counts
and survivor IDs remain in the mutation JSON/HTML artifacts. No critical branch
was excluded to improve a score. The initial restricted Windows run failed worker
disposal (taskkill access denied); the normal-permission measurement is separate.

## B2 scope-correction measurement

Scope-correction measurement at `398df4e8a77cc1e687dd2c1929df5737ca2a7d1c`:
`npm run lint:report` PASS; 43 diagnostic findings (13 complexity, eight nesting,
three parameter-count, 19 function-length). Thresholds remain complexity >12,
depth >3, parameters >4 and length >60 nonblank/noncomment lines. The generated
local report is `reports/lint.json`; it is ignored output, not a durable reviewed
inventory. The completed reviewed inventory is linked above.

B2 must preserve its starting report and deliver the complete reviewed inventory
and before/after summary specified in the
[active scope](../runtime-portability.md#mandatory-complexity-review). Each finding
needs FIX NOW / DEFER / ACCEPT with evidence and rationale. The complete counts,
introduced/fixed findings, severity/module grouping, top five risks and accepted
complexity reasoning are recorded above. No analysis exclusions or thresholds
were changed by the specification correction.

## M2.4.7 lint profile adoption

Starting main: `ec2764def94e573539aaccbc46105c1bc5ebe42d` (merged PR #16).
Reproduced warning ratchet: nine warnings, zero errors. Seven defensive test
teardown conditions now use the ordinary-test profile; two intentional empty-string
fallbacks use the explicit stylistic exception in `tests/support.ts`. No guard or
fallback expression changed. The warning baseline is pruned to zero rather than
expanded. Production rules and source coverage remain intact; `no-unreachable`
is additionally explicit for all maintained code. See the
[profile definitions](quality-gates.md#responsibility-specific-lint-profiles).

This is configuration adoption, not a repair of either historical Windows incident.
Their unresolved classification and B2 NOT READY assessment remain unchanged.
No mutation, coverage, reliability, TypeScript or runtime contract is relaxed.

Local Windows validation: `npm run check` PASS (508 passed, 32 explicit platform
skips); `npm run lint:report` PASS (zero ordinary warnings, 43 complexity/size
review warnings); quality tooling PASS (23 tests). `npm run test:mutation:check`
PASS validates existing source-matched reports; mutation pilots were not rerun
for this configuration-only change. Coverage FAIL (507 passed, one failed,
32 skipped): raw executable recreation hit EPERM after child close. Check and
coverage overlapped under load; this is not causal attribution. Retained local
log `.test-state/m247-coverage.log`, native report
`reports/native-lifetime/3bf4e657-ed5f-47b8-93fd-54acdd3ab6ca.json` and fixture
`arch-fixture-3bNnOr` preserve the failure. `npm run check:reliability` with that
coverage report correctly FAILS despite all four uninstall profiles completing
96 operations: failed native evidence must not become PASS. No retry, skip,
assertion change or operational repair was introduced. Hosted results belong in
the PR and must be inspected separately.

Starting commit: `b1313eee0ce9dfe5103505650eac706c28fc0db5`, main after PR #15.
Current hardening and exact-head CI: [PR #16](https://github.com/Nickshajtan/hcc-harness/pull/16).
Historical measurements and new first-attempt failures remain separately identified.
Human Comprehensibility First remains the review criterion; metrics do not establish stability.
M2.2 B2 implementation is described above and authorized under the
[corrected B2 scope](../runtime-portability.md#b2-scope-and-acceptance-corrections);
authorization does not change the unresolved stability assessment.

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
| Setup               | 78.67% (59/75) | 92.50% (74/80) |      93.75% (75/80) |
| Staging/publication | 81.82% (36/44) | 93.18% (41/44) |      95.45% (42/44) |
| Recovery            | 97.44% (38/39) | 97.44% (38/39) |        100% (39/39) |
| Removal             | 96.61% (57/59) |   100% (59/59) |        100% (59/59) |
| Planning            | 97.92% (47/48) | 97.92% (47/48) |      91.67% (44/48) |

Windows after: 259/270 assertion kills, 9 survivors, 2 uncovered, zero timeouts,
errors or exclusions; final frozen run 6m39s. The approved rollback branch adds five mutants; scopes
were not shrunk. Direct metadata-entry symlink characterization killed the four remaining setup/removal
path-guard mutants; it does not weaken or replace the guards.
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

At frozen implementation commit `30236ca`, hosted Ubuntu coverage is 96.39% lines,
94.30% branches; local Windows is 96.06% lines (879/915), 93.65% branches (576/615).
Both final local check and coverage passed 508 tests / 32 explicit platform skips.
All regression, Wizard, runtime, quality and Windows reliability jobs passed at
that head; [quality artifacts](https://github.com/Nickshajtan/hcc-harness/actions/runs/41368371347)
and [Windows reliability](https://github.com/Nickshajtan/hcc-harness/actions/runs/41368371365)
were inspected. Reliability recorded four profiles, 32 sequences and 96 operations.
These results do not resolve either historical incident. Earlier local check
passed 500 tests / 32 skips, but the
following coverage run failed 499/1/32 on the raw executable probe: two concurrent
lanes hit EPERM unlink after close, outside the sandbox. Both outcomes are retained.
This disproves sandbox-only necessity for raw denial too, without establishing a
handle owner. A later green job cannot erase that first-attempt result.

Ordinary warnings: 52 -> 9, errors 0. Setup review complexity/length: 15/72 -> 16/81;
the added catch preserves approved failure precedence rather than hiding complexity.
Production dependency graph remains 54 modules / 138 edges, no cycles/violations.
There are 43 diagnostic complexity/size review findings, distinct from ordinary warnings.
No production modules, dependencies, schemas, launcher bytes or checkpoints moved.
Recovery failures now retain operation phase, worker and active subprocess identity,
bounded streams and read-only checkpoint snapshots before fixture cleanup. Reporter
and teardown errors are both retained, even when evidence persistence fails.
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
