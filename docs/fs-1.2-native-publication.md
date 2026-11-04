# FS-1.2: production exclusive publication

Implementation baseline: upstream main `e7d4dabbe0017571167830b0192b158326febd35`,
fetched before implementation. PR #20 and #22 are incorporated. GitHub marks #21
merged, but its `a21ee7960c8c21ea0cbdec895d1818ca3ac638e7` research tree is absent
from this main. That exact commit's decision record and native prototype were
reviewed directly. FS-1.0a's staged setup and exact identity checks are retained.
The existing macOS 15 ARM64 runner pins and architecture assertions remain intact.

**Draft; historical external exFAT reliability remains unresolved.** The durable setup-authority
amendment below is implemented. Its real collision/termination regression passes
locally; cross-platform CI and the separate external executable/sharing acceptance
must pass before release. Earlier green CI did not establish these guarantees.

## Durable setup authority

A single `.arch/setup-claim` directory is exclusively created before private stage
creation and before any final resource publication. The directory entry itself is
the guard: there is no partially written JSON to accidentally ignore, and no claim
payload that can grant ownership. An empty, nonempty, corrupted, substituted or
unreadable claim fails closed. Symlinks remain rejected.

`assertBootstrapAuthority()` is shared by setup, status, route planning,
reconciliation, routing recovery validation, uninstall and deinitialize. The guard
is checked before bootstrap/journal authority can authorize mutation, including
direct lifecycle APIs. Status reports `invalid_state`; other operations refuse.
No matching-byte or absent-stage heuristic can resolve a pending claim.

Only the originating invocation can remove its claim: it retains the directory's
identity and must verify it before non-recursive removal. After bootstrap
publication, publication's held-source proof (Windows) or exclusive link (POSIX)
provides attribution. Setup then cleans verified stages, rechecks every published
resource's returned identity and hash, and releases the empty guard last. Windows
uses the post-move identity, accounting for changing exFAT file IDs; consumed
stages are normal. POSIX stages remain links until verified cleanup.

A lost helper response can still complete **in the living publisher** when the
shared adapter proves the move using its held source handle and expected bytes.
An unknown/unattributable outcome preserves the guard and resources without retry.
If that publisher dies before releasing the guard?even after legitimate bootstrap
publication?a fresh process reports ambiguity and preserves the installation.
There is deliberately no automatic post-crash provenance adoption. This is the
smallest fail-closed amendment; it does not add a receipt, transaction framework,
journal schema or ownership-manifest field.

On definite precommit failure, reverse rollback removes only verified invocation-
owned targets, then verified stages and the private directory. Only a fully
successful rollback with no remaining bootstrap releases the guard. A foreign
bootstrap collision preserves the guard and private stage evidence even after
invocation-owned targets were removed. Partial/unrecorded stages, substitution,
foreign residue or cleanup failure retain it. Original and cleanup failures remain
`AggregateError([original, cleanup])`. Postcommit cleanup failure never rolls back
committed resources and leaves the blocking guard. Claim removal is not a public
recovery operation: matching bootstrap bytes alone are insufficient evidence to
manually clear one. Preserve the complete project state for provenance review.

Historical installations without claims retain their documented manifest/hash
contract; no legacy migration or abandonment adoption is introduced. Normal
successful setup leaves no claim. This is process-crash safety, not power-loss
persistence or hostile-mutation protection. Only one full-project mutator is
supported at a time; exclusive publication still independently protects targets.

## Reproduced setup authority gap (regression retained)

This is a real failure, separate from the Windows execution/sharing incidents.
It was reproduced on NTFS with Node 24.19.0 at
`1fe333a4cbf4de3df51deecaac72f1a926a46f22`, using the production native helper:

1. Setup prepares complete files and publishes its non-bootstrap resources.
2. An independent ordinary writer exclusively creates an identical **foreign**
   bootstrap. It does not modify or delete the private source stage.
3. The real helper correctly refuses publication with Win32 183; the source
   remains present and has a different identity from the foreign target.
4. At an IPC barrier after that syscall and before response delivery, the setup
   process is physically terminated with SIGKILL. No timing-based sleep is used.
5. A separate, uninstrumented process reports `initialized` / `valid`, accepts
   repeated setup, and deinit **deletes the foreign bootstrap**.

A separate response-loss injection with the caller still alive also reproduced
this: setup raises its indeterminate-outcome diagnostic and preserves the files,
but subsequent authority readers accept the same manifest. The held-handle proof
prevents immediate adoption inside publication; it cannot preserve an authority
decision after the originating process has gone away.

The exact gap is that a syntactically valid bootstrap plus matching resource
hashes is the existing persistent ownership authority. It contains no evidence
that this setup invocation published it. In-memory success flags, another helper
response parser or an in-process check of the unconsumed source cannot cover the
termination window demonstrated above. Retrying or deleting the ambiguous target
would violate the contract.

Reproduce with built resources on Windows x64:

```powershell
$env:ARCH_WINDOWS_SDK = '10.0.17763.0' # a complete installed SDK
npm run build
npm run build:bootstrap
$env:GITHUB_SHA = git rev-parse HEAD
node scripts/reproduce-setup-authority.mjs
```

**Before amendment: FAIL, exit 1. After amendment: local PASS, exit 0.** The script creates only a unique disposable
project under TEMP (or `ARCH_PUBLICATION_TEST_ROOT`), retains its proof/result
files and prints its location. Its only response hook is inside the test-owned
publisher process; subsequent status/setup/deinit run unmodified production code
in the parent. It verifies real foreign identity, intact source and actual
SIGKILL. No paid CLI, partitioning, antivirus changes or production retry.
This combined scenario is now an ordinary Windows integration regression in
`tests/integration/setup-authority.test.ts`. It retains the original foreign-resource preservation expectations and additionally
checks reconciliation refusal and managed-resource preservation. The real helper
still returns Win32 183 before the publisher is physically killed.

## Shared operation and assumptions

`publishExclusive(root, stage, target, expectedHash)` is the only publication
boundary for setup, routing journals and additions. It requires a regular,
complete stage, safe relative paths and the intended SHA-256. Stage writers must
already be closed. POSIX executable permissions are prepared before publication.
This is a mandatory check, distinct from recovery's optional `verifyStage()`.

Windows x64 invokes a separate statically linked `arch-publication-v1.exe` with
absolute local drive paths and an argument array, without a shell or PATH search.
Its sole operation is `MoveFileExW(source, destination, 0)`: no replacement, copy,
reboot, retry or research modes. It rejects directories/reparse sources and
invalid arguments. Win32 errors are captured immediately and retained numerically.
Linux/macOS retain exclusive hard links through the same boundary. Windows ARM64
is not enabled; existing stable-installation restrictions remain.

The helper returns `{"protocol":1,"win32":0}` on success/exit 0; failures use the
original nonzero Win32 number/exit 1. The adapter distinguishes collision,
missing source, access, sharing, cross-volume, unsupported, invalid input,
execution, protocol and unknown errors. It requires protocol/process agreement,
bounds output to 4 KiB, requests SIGKILL at a 10-second timeout and waits for child
closure through `execFile`. Timeout/crash/output loss is never definite syscall
failure. OS termination/I/O responsiveness remains an operating-system boundary.
No background helper is used during ordinary native CLI execution.

Assumptions remain trusted local projects, one full-lifecycle mutator, normal local
filesystem semantics and same-volume stages/destinations. Primitive-level competing
publishers remain protected by the native no-replace operation. No hostile path
race, network filesystem, nested-mount, power-loss or multi-file atomicity guarantee
is added. Independent readers see complete individual files; executable/shim pairs
and whole route sets are still recoverable multi-file operations.

## Lost responses and exFAT identity

**An exFAT move across directories changes the observed file ID.** An initial
same-directory probe did not reveal this; the first independently installed
consumer failed closed when its setup stages moved into another directory.
Comparing the pre-move ID alone is therefore insufficient.

The shared adapter keeps a read handle to the prepared stage, verifies that it
identifies the verified source, and retains it across the syscall. Node/libuv's
delete sharing permits the move. Afterwards, the handle's current device/file ID
must match the safe final path, final bytes must match the intended digest, and
the source name must be absent. Both NTFS and exFAT handle probes demonstrated
this attribution, including cross-directory moves. Matching foreign bytes alone
never qualify. A lost reply can be resolved only with this object provenance.
The returned final identity updates setup's rollback evidence.
Resolved helper failures remain attached to the publication result and are emitted
as `ARCH_PUBLICATION_RESPONSE` warnings with the original cause; a successful
filesystem attribution does not silently erase transport failure evidence.

If provenance or inspection is indeterminate, the adapter raises an unknown-outcome
error. Setup preserves **all** resources and private stages, without retry or
rollback. An attributable bootstrap publication is accepted even after response
loss, so committed resources are not deleted. A definite refusal may roll back
earlier publications only after safe-path, exact final identity and digest checks.
Compound cleanup failures retain both errors. A source-handle cleanup failure also
fails closed and preserves prior failure evidence.

Bootstrap remains the commit resource, but only a completed, verified setup may
release the durable provenance guard. Historical no-claim manifests retain the
legacy hash authority. Any pending claim blocks adoption and destructive changes,
including after a valid bootstrap was published; see the authority protocol above.

Routing journals remain the recovery authority. Missing consumed stages are
normal. Recovery may recreate an addition stage for an already-published matching
addition, then clean it under the existing journal rules. An orphan journal stage
grants no authority. Additions precede removals; owned metadata replacement is
unchanged; journal removal remains last. No schema changes.

## Build and installation closure

`npm run build:publication` discovers MSVC x64 through the existing vswhere/vcvars
approach and builds separate native source under `native/publication` with
`/MT /W4 /WX /O2 /Brepro`. `ARCH_WINDOWS_SDK` selects an explicit installed SDK.
Local validation uses SDK 10.0.17763.0; the default 10.0.19041.0 installation on
this machine lacks a required header. Missing toolchains fail the build.
No generated executable is committed.

The existing `build:bootstrap` preparation also builds this independent resource;
the bootstrap executable has no publication verb or dependency on the helper.
Build provenance records protocol, binary/source hashes, SDK and compiler flags.
It records the actual MSVC toolset/SDK reported by vcvars and refuses a requested
SDK mismatch. The local verified toolset is 14.16.27023 with SDK 10.0.17763.0;
two `/Brepro` builds produced the identical helper SHA-256.
The stable installer copies the built helper/provenance into the application
vendor closure, verifies the binary hash, and performs an actual protocol/move
probe before hashing resources and publishing `.arch-ready`. Installation hashes
include both resources. Runtime publication verifies the packaged helper against
`installation.json`; missing/corrupt resources fail before invocation. Installed
consumers need no compiler, new runtime, download, elevation or PATH changes.
The readiness probe reuses the same bounded invocation and protocol parser as
runtime publication, after verifying its resource hash, without requiring runtime
readiness to exist during installation.
Copying the stable tree preserves relative resource lookup; existing entrypoint
and readiness contracts remain unchanged.

## Reproducible validation

Build on Windows x64 using the installed supported Node and MSVC toolchain:

```powershell
$env:ARCH_WINDOWS_SDK = '10.0.17763.0' # select a complete installed SDK
npm run build
npm run build:bootstrap
npm test -- tests/integration/native-publication.test.ts tests/integration/setup-publication.test.ts tests/integration/publication-consumer.test.ts
```

For real exFAT, set `ARCH_PUBLICATION_TEST_ROOT` to an existing directory on the
volume and run the same tests. Each creates and removes only unique disposable
children. The independent install stays on Windows TEMP (verify it is NTFS).
`ARCH_SMOKE_NATIVE` may name the installed real `claude.exe` for the optional
non-inference version comparison. The test uses genuine `mise exec`, separately
from explicit shim execution. No partitioning, formatting or antivirus changes.

The suites cover complete JSON/configuration/PE bytes, cross-directory identity,
foreign collisions, independent identical/conflicting publishers and ordinary
writers; real process termination before/after bootstrap; response loss after
real syscalls; setup/reconciliation, interrupted recovery, status, removal,
unrelated/foreign harness preservation, native arguments/cwd/exit, and packaged
helper integrity. Legacy fault-injection unit suites explicitly select the POSIX
hard-link strategy; native state tests and real Windows subprocess suites cover
the consuming implementation. Link counts are asserted only for POSIX.

`ARCH_PUBLICATION_OTHER_VOLUME` optionally enables actual cross-volume refusal;
point it to a disposable parent on the other already-existing volume. It never
creates partitions. The process/protocol boundary has separate portable subprocess
tests for malformed/incompatible replies, bounded output, lost replies, launch
failure and actual timeout termination. These use controlled Node test programs,
not simulated evidence of the Windows filesystem primitive. The real Windows
contracts still invoke the production native executable.

## Complexity review

The analysis profile reports setup at 133 nonblank lines / complexity 26 (FS-1.0a:
117 / 24), shared publication at 128 / 29 with maximum nesting 5, helper resource
resolution at 64 / 28, and snapshot verification at 68 / 13. The Win32 classification
switch (15) and protocol schema checks (21) also exceed the analysis-only complexity target; the structured error
constructor has five parameters. No suppression or warning baseline is changed.
Publication keeps open-handle provenance, syscall outcome, filesystem inspection
and close-error precedence together so ownership authority remains reviewable.
Process invocation is extracted specifically to test transport failures on POSIX
without pretending those tests prove Windows rename semantics. Setup's ordering
and reverse rollback remain explicit. No transaction class or numeric-only split
is introduced; these diagnostics remain visible for independent review.

The authority reproducer has three explicit roles: publisher (70 nonblank lines),
owned-child supervision (70), and authority observation (106 / complexity 28). Its IPC termination and error-preserving teardown stay together; it is a
diagnostic/regression driver, not a second production publication algorithm.
Its static checks pass without suppression despite these analysis-only findings.

Executed results, first-attempt failures, performance and inspected CI links are
recorded in the PR. Raw evidence remains outside the repository. A local Windows
pass does not establish Ubuntu/macOS CI, Windows ARM64 or untested filesystem support.

## Validation status

**Authority amendment verified; historical external reliability remains unresolved.** Positive runs
do not erase historical unexplained failures. The earlier positive/failing runs
used the same production source; the new amendment does not change CLI transport. Raw JSON, original errors
and retained failing fixtures remain outside the source repository.

Local environment: Windows x64 10.0.19045.0, Node 24.19.0, helper protocol 1,
MSVC 14.16.27023 / SDK 10.0.17763.0. The helper SHA-256 is
`4b1e1c7b2369c014fb96ec3d0b95383ca69e7b7852aaf4661a65d9b94999ae41`.
Real volumes were confirmed as NTFS and exFAT. Arch's independent installation
was on NTFS; the final external exFAT consumer directories were outside the source
checkout. Native version checks used Claude Code 2.1.280 and mise 2026.10.11,
with Arch execution trace assertions proving project-scoped routing.

| Check                                               | Observed result                                                                                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local `npm run check`                               | PASS after authority amendment: 763 passed, 35 platform skips; strict lint/zero-warning baseline, typecheck, build, formatting, dependency rules and quality tooling.                                |
| Full coverage after authority amendment             | PASS: 763 passed / 35 skipped; all thresholds met, including new claim scope 100% lines/branches. Setup 98.85% lines / 93.18% branches.                                                              |
| Bootstrap authority interruption regression         | Local PASS after amendment: actual helper Win32 183, independent writer and SIGKILL; status/setup/reconcile/deinit refuse and preserve foreign bootstrap plus managed resources. Updated CI pending. |
| Pre-amendment Windows effect mutation               | PASS: six 85% assertion-only gates. Native adapter 90.20%, publication 86.67%, setup 95.24%; no ignored/error mutants. Five timeouts earn no assertion credit                                        |
| NTFS install / NTFS consumer at `701299c`           | PASS: same 24-case native/setup/independent-consumer suite, no skips, including real native version and mise activation                                                                              |
| NTFS install / external exFAT consumer at `701299c` | FAIL: 20 passed / 4 failed. Setup's eight cases passed; sharing-holder cleanup failed and consumer tests timed out/cascaded                                                                          |
| Subsequent bounded external-consumer diagnosis      | FAIL: one passed / two failed. Real Claude version passed; fixture CLI through mise and explicit project launcher stalled with no captured output; owned-child teardown also failed                  |

At final production commit `88c39fd`, the full external exFAT matrix passed
**28/28 with no skips**: native sharing/cross-volume/concurrency, setup interruption,
the real foreign-bootstrap collision/SIGKILL regression, and all three independently
installed consumer cases. These include real CLI `--version`, genuine mise
activation, argument/cwd/exit forwarding, route recovery, foreign files/configuration
and helper integrity. They are fresh acceptance observations, not proof of a
correction for the earlier stalls. No transport/native operation, retry, antivirus
policy or timeout was changed by this amendment.

The [Windows CI job](https://github.com/Nickshajtan/hcc-harness/actions/runs/41852300687/job/126651522037)
was inspected: the mandatory real-process authority regression ran and passed;
659 unit tests passed / four skipped, 102 integration tests passed / five skipped,
and acceptance passed. Windows, Ubuntu and macOS regression jobs passed at this
production commit. Windows/Ubuntu runtime and Windows reliability also passed;
macOS runtime jobs remained queued at observation, **NOT TESTED** for that run.

The [hosted effect mutation job](https://github.com/Nickshajtan/hcc-harness/actions/runs/41852300622/job/126656193627)
completed in 4m05s and validated current production source with all seven 85%
assertion-only gates passing: setup 144 kills / 154 (93.51%), claim 25/28 (89.29%),
native adapter 221/245 (90.20%), publication 157/180 (87.22%), routing plan 44/48
(91.67%), recovery 39/39 and removal 59/59. Five adapter timeouts earn zero assertion
credit; there are no compile/runtime errors or ignored mutants. The claim's error-
classification survivor was killed by the inspection-error regression. Its three
remaining survivors weaken directory/device predicates while retaining differing
inode rejection; the defensive checks remain. Same-volume local identities are
tested; hostile mount/path substitution remains outside the contract.

Lifecycle mutation source validation also passed: 385 assertion kills / 397,
10 survivors, two uncovered, no timeouts/errors/ignored. Ownership and recovery
validation were 100%; all unchanged gates passed.

A local mutation-evidence command incorrectly shared its incremental-cache and
JSON-reporter path. Two Stryker writers produced a malformed report; that file and
the parse failure were preserved, not repaired or accepted. Regeneration with
separate cache/report paths completed in 8m46s, using supported reuse of 644/753
results from a validated earlier snapshot. Current-source validation passed:
697 assertion kills, five timeouts, 47 survivors, four uncovered, no errors/ignored.
All seven gates passed: setup 147/154 (95.45%), claim 25/28 (89.29%), adapter
221/245 (90.20%), publication 158/180 (87.78%), and plan/recovery/removal 100%.
Timeout-inclusive score was 93.23%; timeouts earned no assertion credit. The
original malformed report was not trimmed, merged or used as passing evidence.
This tooling failure is separate from publication/ownership behavior.

A separate read-only [Restart Manager query](https://learn.microsoft.com/en-us/windows/win32/api/restartmanager/nf-restartmanager-rmgetlist)
reported no current resource users for the retained stalled launcher and both
sharing-test stage files. This after-the-fact observation does not identify the
cause or exclude transient kernel/filter sharing. No shutdown/restart API was
used. Historical stalls remain UNRESOLVED and the PR remains a draft.

Earlier 24-case NTFS/exFAT runs passed with consumer directories under the checkout.
An earlier outside-checkout run passed all three independent-consumer cases, but
failed the sharing test's teardown (`EBUSY`, stage unlink). A stronger release
handshake also failed outside the checkout: after disposing its own FileStream,
the holder's one attempted `File.Delete` received a sharing exception. Its
publication assertions had required Win32 32, unchanged stage bytes and no target.
No retry, timeout increase, antivirus change or production workaround was added.

The consumer diagnostic identifies stalls during native launcher execution, after
initialization/status, rather than a reported publication-helper failure. One
test-owned Arch process survived launcher teardown; its identity was recorded and
it was explicitly terminated. Failed installation/project fixtures were retained.
These incidents remain **UNRESOLVED**: neither exFAT nor antivirus is established
as the cause. General Windows executable-lifetime remediation remains outside FS-1.2.
They block a stability/readiness recommendation and acceptance gate G even when CI
and separate repetitions pass.

The effect run took 14m20s using Stryker's supported incremental reuse (538 of 718
mutants); original source matching was enforced. Remaining adapter survivors
include redundant validation predicates, fail-closed metadata guard variants,
message/encoding variants and `windowsHide`; two uncovered mutants are the
defensive non-Error parser fallback. Five callback/promise-disabling mutants timed
out, with zero assertion credit. These are limits of the evidence, not exclusions
or a claim of exhaustive equivalence. POSIX-only setup permissions remain covered
by hosted POSIX suites rather than local Windows execution.

The final Windows stable-install measurement also completed with matching source
after sharing the helper transport: 358 mutants, 307 assertion kills, three
timeouts, 41 survivors, seven uncovered, no errors/ignored mutants. The supported
incremental pass reused 326 results and took 3m51s (initial full run: 9m05s).
Installer assertion-only score is 83.46%; layout 90%, runtime guard 100%.
Existing stable-pilot numeric targets remain nonblocking; none were lowered.
The new checksum, response, expected-byte and foreign-probe guards were exercised;
the shared response/timeout parser retains its separate effect gate. These
measurements predate the durable authority amendment and **do not validate** its new branches. Updated source-matching evidence is required.

A preliminary integrated shared-operation probe measured 20 operations at 71.8 ms
median, 148.7 ms maximum, including process spawn, verification and handle tracking.
It used the development helper path and NTFS targets, not an isolated installed
exFAT performance benchmark. Publication is a lifecycle cost, not a per-command
cost; no optimization or native addon is introduced.
