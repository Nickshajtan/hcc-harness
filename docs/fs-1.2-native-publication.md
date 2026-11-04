# FS-1.2: production exclusive publication

Implementation baseline: upstream main `e7d4dabbe0017571167830b0192b158326febd35`,
fetched before implementation. PR #20 and #22 are incorporated. GitHub marks #21
merged, but its `a21ee7960c8c21ea0cbdec895d1818ca3ac638e7` research tree is absent
from this main. That exact commit's decision record and native prototype were
reviewed directly. FS-1.0a's staged setup and exact identity checks are retained.
The existing macOS 15 ARM64 runner pins and architecture assertions remain intact.

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

Bootstrap remains last and is setup's effective ownership commit point, not a
multi-file transaction. Pre-bootstrap crash residue is not automatically adopted
or deleted. A valid bootstrap remains the existing status authority; an explicit
indeterminate-outcome diagnostic requires inspection rather than inferring new
ownership from matching bytes. Post-commit stage cleanup failures preserve the
committed installation. Repeated setup uses historical hashes.

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

The analysis profile reports setup at 126 nonblank lines / complexity 26 (FS-1.0a:
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

Executed results, first-attempt failures, performance and inspected CI links are
recorded in the PR. Raw evidence remains outside the repository. A local Windows
pass does not establish Ubuntu/macOS CI, Windows ARM64 or untested filesystem support.

## Validation status

**Implementation delivered; exFAT acceptance/readiness blocked.** Positive runs
do not erase subsequent unexplained failures. The production source is unchanged
between the positive and failing filesystem runs below. Raw JSON, original errors
and retained failing fixtures remain outside the source repository.

Local environment: Windows x64 10.0.19045.0, Node 24.19.0, helper protocol 1,
MSVC 14.16.27023 / SDK 10.0.17763.0. The helper SHA-256 is
`4b1e1c7b2369c014fb96ec3d0b95383ca69e7b7852aaf4661a65d9b94999ae41`.
Real volumes were confirmed as NTFS and exFAT. Arch's independent installation
was on NTFS; the final external exFAT consumer directories were outside the source
checkout. Native version checks used Claude Code 2.1.280 and mise 2026.10.11,
with Arch execution trace assertions proving project-scoped routing.

| Check                                               | Observed result                                                                                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local `npm run check`                               | PASS: 733 tests passed, 35 skipped; strict lint/warning baseline, typecheck, build, formatting, dependency rules and quality tooling passed                                         |
| Full coverage                                       | 733 passed / 35 skipped; all unchanged configured thresholds met. Setup 98.70% lines / 92.85% branches; shared publication 98.33% / 96.49%; native adapter 100% / 98.86%            |
| Source-matching Windows effect mutation             | PASS: six 85% assertion-only gates. Native adapter 90.20%, publication 86.67%, setup 95.24%; no ignored/error mutants. Five timeouts earn no assertion credit                       |
| NTFS install / NTFS consumer at `701299c`           | PASS: same 24-case native/setup/independent-consumer suite, no skips, including real native version and mise activation                                                             |
| NTFS install / external exFAT consumer at `701299c` | FAIL: 20 passed / 4 failed. Setup's eight cases passed; sharing-holder cleanup failed and consumer tests timed out/cascaded                                                         |
| Subsequent bounded external-consumer diagnosis      | FAIL: one passed / two failed. Real Claude version passed; fixture CLI through mise and explicit project launcher stalled with no captured output; owned-child teardown also failed |

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

A preliminary integrated shared-operation probe measured 20 operations at 71.8 ms
median, 148.7 ms maximum, including process spawn, verification and handle tracking.
It used the development helper path and NTFS targets, not an isolated installed
exFAT performance benchmark. Publication is a lifecycle cost, not a per-command
cost; no optimization or native addon is introduced.
