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
117 / 24), shared publication at 110 / 28, helper resource resolution at 64 / 28,
and snapshot verification at 76 / 15. The Win32 classification switch and protocol
schema checks also exceed the analysis-only complexity target; the structured error
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
