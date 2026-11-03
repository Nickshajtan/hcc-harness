# FS-1.1: native no-replace publication feasibility

**PROVEN FEASIBLE for Windows x64 on tested NTFS and exFAT.** A standalone,
133,120-byte statically linked helper successfully publishes complete files without
hard links or replacement. Recommend a separate one-operation helper using
`MoveFileExW(stage, target, 0)`, invoked directly by Node. This is native API and
integration feasibility, **not complete Arch lifecycle acceptance**. Linux/macOS
and ARM64 execution remain unvalidated; keep their current hard-link path until
their replacement is validated. Do not silently substitute ordinary rename/copy.

Input: [FS-1 decision](fs-1-publication.md), PR #20 commit `504c9df`.
Upstream main fetched again on 2026-11-03 remains
`15f46357d8dd6fb9cc8a33933b6fab08b5fd7ac2`. No production, journal, installation,
mise or routing contract changes in this research. All experiments are isolated in
[`research/fs-1.1`](../research/fs-1.1/README.md); raw evidence remains outside Git.

## Native primitives and proof boundaries

| Platform/API                                       | No-replace and visibility mechanism                                                                                                                                                       | Constraints and result                                                                                                                                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows MoveFileExW, flags **0**                   | Same-volume namespace move of an already closed stage; existing destination makes the operation fail. Neither REPLACE_EXISTING nor COPY_ALLOWED nor delayed/reboot behavior is requested. | Demonstrated NTFS/exFAT, Windows 10 build 19045 x64. Smallest binding. Cross-volume error 17; no copy fallback.                                                                                                                             |
| Windows SetFileInformationByHandle, FileRenameInfo | Open source with DELETE access and read/write/delete sharing; submit FILE_RENAME_INFO with ReplaceIfExists FALSE. Kernel rename cannot move across volumes.                               | Same Windows suite passed. More handle/allocation/error-close code than MoveFileExW; no extra required guarantee established for current trusted-stage policy.                                                                              |
| Windows FileRenameInfoEx                           | Extended flags include replacement, POSIX replacement of open targets, and attribute/storage policies. Zero replacement flag preserves exclusive intent.                                  | Investigated, not executed. No need for this newer, driver-dependent interface. Never enable replacement or POSIX replacement to bypass locking.                                                                                            |
| Linux renameat2, RENAME_NOREPLACE                  | One kernel rename operation refuses an existing destination; files remain prepared, not copied into a live name.                                                                          | Kernel >=3.15, glibc wrapper >=2.28; filesystem support required. ext4 since 3.15, btrfs/tmpfs 3.17, xfs 4.0. ENOSYS/unsupported symbols, EINVAL/unsupported flags and EXDEV fail closed. NOT TESTED locally.                               |
| macOS renamex_np, RENAME_EXCL                      | Exclusive rename returns EEXIST for existing targets on supporting filesystems; no user-space preflight is the exclusion boundary.                                                        | Apple documents VOL_CAP_INT_RENAME_EXCL and ENOTSUP. APFS is the intended validation target, not proven by this Windows experiment. Compile/deployment SDK and runtime availability must be checked for both CPU architectures. NOT TESTED. |

Microsoft's [MoveFileExW contract](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
defines flags and failure reporting. Its page alone is not a universal atomicity
proof for every driver. The inference for the tested local filesystems combines
same-volume rename semantics, no replacement/copy flags, native collision races,
and independent-reader tests. Fully prepared bytes exist before the namespace
operation; neither candidate has an incremental final-path write step.
This establishes process-visible publication on the tested stack, not power-loss
durability or an exhaustive proof about arbitrary filter drivers/Windows releases.

The [FILE_RENAME_INFO contract](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info)
explicitly rejects existing targets when ReplaceIfExists is false.
[SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle)
notes driver/OS variation. The [kernel rename flags](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information)
distinguish replacement and POSIX semantics. These flags solve different problems;
they are not needed for exclusive publication. The helper captures GetLastError
immediately, before closing its source handle.

[CreateFile sharing rules](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)
require compatible DELETE sharing for rename. Observed source-read handles with
read/write/delete sharing allowed publication; omitting delete sharing produced
32 (ERROR_SHARING_VIOLATION), preserving the stage and absent target. Existing
open targets still produced 183 (ERROR_ALREADY_EXISTS) without changing bytes or
identity. Renaming a running source executable succeeded here; replacing a running
target was refused. These observations do not resolve historical executable
deletion/lifetime incidents or justify retries. Readers can encounter transient
sharing failures even after a rename notification: see Microsoft's
[rename sequence explanation](https://devblogs.microsoft.com/oldnewthing/20211022-00/?p=105822/).

Linux's [maintained syscall manual](https://man7.org/linux/man-pages/man2/rename.2.html)
documents the filesystem/kernel dependencies separately from Windows semantics.
WSL2's Linux-native ext4 filesystem should exercise that Linux path; `/mnt/c` and
other Windows-mounted filesystems require separate validation. The installed WSL2
distribution could not start: virtualization/VirtualMachinePlatform unavailable.
No machine configuration changes were attempted. macOS uses Apple's
[rename manual source](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/man/man2/rename.2),
which makes exclusive capability filesystem-dependent. Apple's
[exported header](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/stdio.h)
marks renamex_np/renameatx_np available from macOS 10.12 and defines RENAME_EXCL
as 0x4. Set the release deployment target to Arch/Node's supported macOS minimum,
not merely this older API minimum. Apple's
[exclusive-rename tests](https://github.com/apple-oss-distributions/xnu/blob/main/tests/rename_excl.c)
also show case-only/self-rename exceptions on case-insensitive volumes. Arch uses
distinct stage/final basenames; preserve that restriction and test aliases before
platform promotion. APFS capability and actual behavior still require execution.

## Actual Windows evidence

Same MSVC x64 `/MT /W4 /WX /O2` binary, Node 24.19.0, test source and Windows build
on both real volumes. Read-only Get-Volume identified C: NTFS and D: exFAT; no
partitions were created/reformatted. Unique mkdtemp children were removed only
after success and after owned subprocesses closed. No paid inference or Arch
production code ran. Original numeric errors are retained in raw JSON.

| Scenario (per API, per filesystem)                                                                      | NTFS                                        | exFAT                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Prepared JSON, shim configuration and native PE publication; stage consumed; executable --version works | PASS                                        | PASS                                        |
| Existing target, exact bytes and stat identity (dev/ino/birth time/mode) preserved, stage retained      | PASS; 183                                   | PASS; 183                                   |
| 12 conflicting and 12 identical payload races, independent native processes                             | PASS; exactly one success each              | PASS; exactly one success each              |
| 12 races with independent ordinary Node wx writer                                                       | PASS; exactly one success                   | PASS; exactly one success                   |
| Writer creates target after native process ready, before publication release                            | PASS; 183; foreign identity/bytes unchanged | PASS; 183; foreign identity/bytes unchanged |
| Kill live process before/after native operation; inspect stage and target bytes                         | PASS                                        | PASS                                        |
| Missing stage / directory target collision                                                              | PASS; 2 / 183                               | PASS; 2 / 183                               |
| Unicode and spaces in all case directories                                                              | PASS                                        | PASS                                        |
| Open source with/without delete sharing                                                                 | PASS; 0 / 32                                | PASS; 0 / 32                                |
| Existing open target, both sharing modes                                                                | PASS; 183                                   | PASS; 183                                   |
| Running executable source rename / running executable target collision                                  | PASS; 0 / 183                               | PASS; 0 / 183                               |
| Independent reader continuously compares 4 MiB target to prepared bytes                                 | PASS; complete bytes only                   | PASS; complete bytes only                   |

The final suite contains 102 scenarios per filesystem, 51 per API (including
repetitions). Races are bounded evidence, not an exhaustive scheduler proof.
The ordinary writer won in the explicitly ordered case; simultaneous releases
favored the native publisher locally. No artificial sleeps determine correctness.
Stat identity is the OS/libuv observable identity, not a full security-descriptor
audit. Native code never opens the destination for mutation on a refused move.

The separate packaging probe copied the helper onto NTFS and invoked it by absolute
path from an exFAT consumer using execFile with an argument array and shell disabled.
20 successful operations per API consumed stages. Both APIs refused NTFS-to-exFAT
stage moves with **17 (ERROR_NOT_SAME_DEVICE)**, leaving source bytes and no target.
In the final rebuilt-helper run, median end-to-end spawn+operation latency was
45.9 ms (move), 44.9 ms (handle); maxima 82.1/59.5 ms. The earlier successful run
measured 55.5/59.4 ms medians. These are local observations, not performance promises.
The helper installation volume and the stage/target volume are independent.

Initial default SDK compilation failed on missing specstrings_strict.h; SDK
10.0.17763.0 built successfully. The first packaging script had argument parsing
errors, and the last executable-collision test initially had duplicate variable
declarations; these were fixed before their successful runs. Initial lint found
four literal-order violations in research scripts; corrected without suppressions.
An initial checkpoint test allowed an
input newline to release the post-operation barrier; corrected to send a single
byte and assert the process is alive before killing it. Only corrected final-run
counts above certify the interruption tests. No production retry was introduced.

## Node integration choice

| Mechanism                          | Packaging, runtime independence and cost                                                                                                                                                                                                            | Decision                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tiny Node-API addon                | Stable Node-API ABI avoids per-Node V8 rebuilds, but requires six platform/CPU builds, Node headers/build tooling and addon loading; OS/libc ABI still matters. In-process, low call overhead, native faults affect Arch.                           | Viable second choice if helper overhead becomes material. No addon ABI experiment performed.                                                              |
| Separate native helper             | No Node ABI or runtime discovery. Windows static CRT needs no consumer compiler/runtime installation. Absolute-path execFile, bounded output, original OS number. One spawn per publication; helper failure is isolated but outcome can be unknown. | **Recommended**, demonstrated on Windows x64. Single native operation, no bootstrap coupling.                                                             |
| Maintained dependency exposing API | Koffi is actively maintained and documents Windows/Linux/macOS x64/ARM64 prebuilds; FFI can call the exact OS functions rather than Node rename. Its general FFI/native surface exceeds this need and requires careful same-thread error capture.   | Credible alternative, not installed/tested. No dedicated maintained exact-operation package established by this bounded search. Do not claim none exists. |
| Existing supported runtime         | Node cannot call arbitrary OS APIs directly. PowerShell P/Invoke would require runtime compilation/extra interpreter at use time; shell Move-Item/mv contracts are inappropriate. Python/.NET/new runtimes expand the deployment contract.          | No smaller supported runtime route identified.                                                                                                            |

Sources: [Node-API ABI policy](https://nodejs.org/download/release/v24.15.0/docs/api/n-api.html),
[Koffi platform matrix](https://github.com/Koromix/koffi),
[Koffi library/function binding](https://koffi.dev/load),
[maintenance changelog](https://koffi.dev/changelog). Koffi's maintenance and
platform claims are upstream documentation, not local execution evidence.

The existing `scripts/build-stable-bootstrap.mjs` -> `scripts/b1/build-bootstrap.*`
pipeline already discovers MSVC and builds `/MT` x64. Reuse that discovery/CI tool
setup; keep separate source, binary and responsibility. Do not add a filesystem
verb to arch.exe. `stable-install.ts` copies all vendor resources before snapshot
hashing/readiness, so a versioned helper under `vendor/` fits the existing closure
without changing readiness, project launchers or stable entrypoint contracts.
The installer intentionally runs npm with `--ignore-scripts`; do not rely on a
consumer postinstall native build or network download.

Build once per target in release CI, retain source/license/provenance and checksums,
copy the appropriate helper into the package, and verify its protocol before
snapshot readiness. No PATH lookup, elevation, arbitrary library loading, runtime
download or compiler on the consumer. Six native targets are prospective: Windows
x64/ARM64 (MSVC target tools), Linux x64/ARM64 (documented glibc floor or separately
validated musl builds), macOS x64/ARM64 (SDK/deployment target and signing policy).
Current stable Windows install explicitly rejects ARM64; this research does not
authorize relaxing it. Windows x64 can ship first; keep existing POSIX publication
until real native platform validation. Existing bootstrap is not a six-target
binary distribution system, so artifact/release work remains real FS-1.2 scope.

## Lifecycle feasibility and FS-1.2 specification

Successful rename consumes the stage at **both** current callers. No inode/link
count is used by Arch ownership. The journal already permits missing stages, and
cleanup uses optional unlink. Required minimal behavior:

1. At `routing.stage -> routing.json`, verify complete intended journal bytes and
   both safe paths, close all writer handles, then publish. Before success, stage
   remains and no journal exists. After success, the complete journal authorizes
   recovery even when routing.stage is absent. Unknown helper outcome must preserve
   evidence and be reconciled from actual journal bytes; never delete or retry blindly.
2. At each addition, keep journal payload/hash validation and target preflight;
   exclusive rename is the final no-clobber boundary. Missing stage after success
   is valid. Current recovery recreates a missing addition stage even when a matching
   target exists, then skips publication and safely cleans that recreated stage.
   This is unnecessary I/O but correct under current contracts; no new state/schema
   or optimization is needed. Differing target bytes still block recovery.
3. Immediately before native publication, require an existing regular stage and
   compare its actual bytes to intended payload. Existing verifyStage allows absence
   for recovery, so do not treat that optional check as a mandatory publication
   integrity check. Pass expected bytes/hash explicitly at the boundary or use a
   narrow adjacent verifier. Retain safe-path checks for source and destination.
4. Keep manifest replacement, additions-before-removals, final validation, optional
   stage cleanup and journal removal last. Collision (even identical bytes) is a
   failed publication, not successful ownership. Subsequent recovery's existing
   matching-byte rules remain unchanged; no foreign file deletion authority is added.
5. Production helper should expose only renameNoReplace, not research barriers,
   hold modes or method selection. Define usage/protocol version, absolute regular
   paths, bounded length/output, and reject same source/target aliases. Preserve raw
   Win32/errno plus operation in structured errors; distinguish 183/80 collision,
   32 sharing, 5 access, 2 missing, 17 cross-volume, unsupported operations, and
   helper spawn/protocol/termination failures. A timeout/termination after syscall
   may mean publication happened; status/recovery determines ownership, not exit alone.

Expected production surface: one small native helper, one build/selection adapter,
`routing-files.ts`, its two callers if expected bytes are passed, vendor artifact
selection/verification, focused tests and docs. Rough review estimate: native
operation/protocol tens of lines; Node binding/integrity/error handling roughly
50-120 lines; build/release work and tests additional. No generic filesystem layer,
provider, bootstrap runtime behavior, database, retry policy, journal schema or mise
changes. Actual patch size must follow implementation review, not this estimate.

FS-1.2 must add mandatory stage-integrity and consumed-stage recovery tests for
journal/PE/shim resources, late ordinary writer and independent publisher collisions,
unknown helper completion, missing/modified/partial stages, permission and cleanup
failures, interrupted manifest/cleanup, repeated reconcile/status and symlinks.
Run existing routing/recovery and stable-runtime regressions, relevant effects
mutation without lowering gates, native build warnings, typecheck/lint/build and
binary/package closure tests. Run the same native suite on Windows NTFS/exFAT;
use a disposable existing real exFAT volume on a dedicated runner or reproducible
manual gate, never partition/reformat disks in CI. POSIX promotion requires actual
ext4/APFS and both-architecture build/runtime evidence; WSL2 ext4 is supplementary.
Finally run independently installed NTFS Arch against an exFAT consumer, native
--version, ownership/status/reconcile/foreign collision/removal/recovery and mise.
Initial setup's direct writes remain a separately identified visibility limitation;
do not claim the whole lifecycle has atomic publication solely from this helper.

## Limits and executed gates

Assumptions: trusted local project, no hostile concurrent stage/path mutation,
closed and verified stage writers, same-volume stage/target, normal NTFS/exFAT
drivers. Existing single lifecycle mutator contract remains. Primitive races do
not certify concurrent full lifecycle operations. No multi-file atomicity, pair
readiness, power-loss durability, SMB/NFS/FAT32/ReFS support, antivirus causality
or general Windows lifetime reliability claim. No stage hash is checked by the
prototype itself; that remains mandatory Node/lifecycle integration work.

Windows x64 native contracts and copied-helper integration: **PASS** as above.
Linux: **NOT TESTED**, WSL2 launch unavailable. macOS/APFS and all ARM64 execution:
**NOT TESTED**. Full Arch integration, stable external consumer smoke, mutation
and platform matrices: **NOT TESTED**, production unchanged. Check commands and
final local gate results follow; no CI success inferred.

| Executed local check                                                                                                                                                                                                                                                                                                         | Result                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `powershell -NoProfile -File research/fs-1.1/build.ps1 -OutputDirectory .test-state/fs-1.1 -WindowsSdk 10.0.17763.0`                                                                                                                                                                                                         | PASS; MSVC warnings are errors                                              |
| `node research/fs-1.1/contract.mjs <helper> <NTFS-parent> NTFS`, identical command with exFAT parent/label                                                                                                                                                                                                                   | PASS; 102 scenarios each, zero skips                                        |
| `node research/fs-1.1/integration.mjs <helper> <NTFS-parent> <exFAT-parent>`                                                                                                                                                                                                                                                 | PASS; 40 copied-helper operations and two explicit cross-volume refusals    |
| `npm run typecheck`, `npm run lint`, `npm run build`                                                                                                                                                                                                                                                                         | PASS; no new production complexity or lint warnings                         |
| `npm test -- tests/unit/lifecycle.test.ts tests/unit/lifecycle-effects.test.ts tests/integration/lifecycle.test.ts tests/unit/ownership.test.ts tests/unit/routing-journal.test.ts tests/unit/manifest.test.ts tests/unit/lifecycle-contract.test.ts tests/unit/setup-contract.test.ts tests/unit/recovery-evidence.test.ts` | PASS; 9 files, 170 passed, 1 existing POSIX-only permission skip on Windows |

Formatting and diff verification are reported in the research PR after the final
documentation edit. No test expectations, lint profiles, mutation thresholds or
production source were changed. Native research code remains outside ESLint's
language support and is compiled with `/W4 /WX`; its tests are ordinary linted JS.

`npm run format:check`, `npm run lint:baseline` and `git diff --check`: **PASS**.
The warning baseline remains zero. Full CI and relevant production mutation gates
must run during FS-1.2; no production mutation result is claimed for this research.
