# Platform and filesystem compatibility

## Current production

Arch requires Node **>=24.15.0 <25**. The checked-in toolchain uses Node 24.19.0 and
mise 2026.10.11. Ubuntu, macOS and Windows run the existing regression and wizard
matrices; [testing](testing.md) records evidence and outstanding manual checks.
Windows ARM64 artifacts are supplied but execution remains **NOT TESTED**.

The npm bin is `dist/cli.js`; `npm link` is a development link to the checkout,
not an independent installation. Node version managers may change npm's prefix and
make that link unavailable. No PATH/profile configuration is edited automatically.
PowerShell execution policy can require `arch.cmd`; direct Node invocation remains
available with a compatible runtime. Development-generated project routes retain
captured checkout/Node paths; stable-generated routes use the independent entry.
Missing historical targets can be inspected/deinitialized from another
working checkout without executing old launchers; see [recovery](usage.md).

POSIX launchers use `exec` and `"$@"`. Windows routes use unmodified Scoop `.exe`/
`.shim` pairs; [vendor provenance](../vendor/README.md) records licenses and hashes.
Native `.exe`/`.com` and supported npm `.cmd` targets run with no command shell.
For standard npm Node shims, adjacent Node is preferred when the shim requests it;
otherwise native PATH supplies Node. Simple shims do not invent adjacent preference.
Neither Arch's `process.execPath` nor `ARCH_NODE` is a native fallback. Arbitrary
batch programs, customized shell wrappers, functions and aliases are not emulated.

Arguments, cwd, inherited streams and native statuses are preserved. Arch filters
only directories with its exact router marker from native PATH and rejects recursive
targets. Supported console cancellation manages the direct child; POSIX has a
3-second SIGKILL fallback. Windows Ctrl+C/Ctrl+Break can produce 130/149 or native
`0xC000013A`. Force termination cannot run finalizers; descendants remain the native
tool's responsibility. Automated TTY tests do not validate every emulator or AI TUI.

## Exclusive publication

The [FS-1 investigation](fs-1-publication.md) established the Node built-in API
limitation. [FS-1.2](fs-1.2-native-publication.md) supplies a packaged Windows x64
native no-replace rename helper. Initial setup and route reconciliation use the
same verified-stage publication boundary. Linux/macOS retain exclusive hard links.

M2 reconciliation (`configure`, `route add/remove`) publishes complete staged files
with an exclusive native move on Windows x64 or hard links on POSIX. It never replaces a newly appearing destination. Only
the already-owned manifest is replaced with same-directory staged rename after
validation. Ordinary rename has no portable no-replace guarantee; exclusive copy
can expose incomplete bytes. No copy, exclusive-write or alternate fallback is used.

Windows x64 NTFS and exFAT publication tests use the packaged helper; its
installation may be independently located on NTFS. FS-1.2 is not release-ready:
an actual interrupted bootstrap collision can lead to adoption/deletion of foreign
metadata, including on NTFS. Full exFAT acceptance is also
blocked by unresolved launcher execution stalls and sharing-test cleanup failures;
see the [validation record](fs-1.2-native-publication.md#validation-status).
Stages and final files must
share a volume. POSIX filesystems still require hard links (for example supported
local APFS/ext4 configurations). No filesystem-type detection or weaker fallback
is used. Other filesystems, mounts and architectures are not certified by these
results. Errors preserve original OS information; sharing errors are not evidence
that a filesystem lacks the required capability.

Initial setup now uses the same staged publication boundary; see
[setup publication safety](fs-1.0a-setup-publication.md). Unchanged desired routes
and ordinary deinit do not inherently need hard links. Pending routing recovery is different: deinit completes the update
first and may need publication. npm CLI installation is separate from these operations.

If initial journal publication fails, old routes and ownership remain intact; an
unreferenced stage may remain. If publication fails later, additions can already be
visible. Retain the journal and stages; retry the recorded operation after fixing
capability/permissions. Windows sharing/manifest replacement errors also preserve
checkpoints. Recovery instructions are in [usage](usage.md).

Updates are recoverable, not atomic route-set switches: Windows exe/shim pairs can
be partially visible until recovery. Only one mutator per project is supported;
exclusive journals detect conflicts but do not eliminate filesystem races. Network/
cloud mounts and fsync/power-loss durability have not been established. Capability
failures are tested deterministically; CI does not require a real exFAT volume.

## Manifest compatibility and future portability

M1/M2/M2.1 ownership remains unversioned `{ files, createdHarness }`. Actual bytes
and recorded hashes are authoritative, independent of current renderer output,
JSON property order or target reachability. Incomplete legacy objects may remain
safe to remove without qualifying as healthy routable installations. Unsafe paths,
modified remaining files and conflicting journals remain errors. Frozen fixture
provenance is in [tests/fixtures/M1.md](../tests/fixtures/M1.md).

M2.2 B1 independent Arch/project/native runtimes are **VERIFIED FEASIBILITY**.
B2 adds explicit stable installation, independent entrypoints and a pre-import
runtime guard; actual acceptance evidence is in the maintained quality baseline
and PR, not inferred from B1. Stable initialization uses that snapshot's bootstrap;
existing captured launchers are not rewritten or migrated. See the
[installation contract](runtime-portability.md#stable-installation-contract).
Independent Windows bootstrap execution currently requires x64; ARM64 vendor
packaging is not evidence of ARM64 bootstrap execution. WSL2/Docker and real AI
CLI integration are separate milestones.

Stable installation does not need hard links: exclusive destination reservation
and completion-directory publication provide its no-clobber boundary. The parent
must be trusted and free of symlinks. Failed/incomplete trees are retained for
inspection, never recursively rolled back. Windows project setup and reconciliation
use the packaged helper included in the stable resource integrity closure; POSIX
still requires hard links. Unknown helper outcomes require filesystem/object
attribution or preservation for inspection, never a blind retry or cleanup.
No power-loss durability or adversarial same-user filesystem-race protection is claimed.
