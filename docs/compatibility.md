# Platform and filesystem compatibility

## Current implementation and scoped acceptance

Use the [capability matrix](capabilities.md) for current boundaries and the
[validation index](validation/README.md) for original platform/provider verdicts.
An implemented contract is not universal release acceptance.

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
targets. POSIX foreground SIGINT is delivered by the terminal group, without wrapper
forwarding or escalation; PID-only SIGINT after spawn is ignored. SIGTERM/SIGHUP
manage the direct child with a 3-second SIGKILL fallback. See [signal policy](usage.md#signals-and-nested-execution). Windows Ctrl+C/Ctrl+Break can produce 130/149 or native
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
the durable setup claim now blocks interrupted bootstrap adoption and destructive
lifecycle APIs, with local regression evidence. Full exFAT acceptance remains
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
packaging is not evidence of ARM64 bootstrap execution. Targeted WSL2/ext4 process acceptance and real AI CLI consumer routing now have
separate reports; Docker remains unverified. These do not establish native provider
policy enforcement or unrestricted TUI support.

Stable installation does not need hard links: exclusive destination reservation
and completion-directory publication provide its no-clobber boundary. The parent
must be trusted and free of symlinks. Failed/incomplete trees are retained for
inspection, never recursively rolled back. Windows project setup and reconciliation
use the packaged helper included in the stable resource integrity closure; POSIX
still requires hard links. Unknown helper outcomes require filesystem/object
attribution or preservation for inspection, never a blind retry or cleanup.
No power-loss durability or adversarial same-user filesystem-race protection is claimed.

## Provider and terminal evidence limits

| Environment                                  | Accepted evidence                                                  | Outstanding boundary                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Windows 10 x64 control, `d028df2`            | CONDITIONAL GO; selected W1-W4 and non-inference routing           | Active Avast unverified; not Windows 11 or full authenticated TUI acceptance                           |
| Ubuntu 22.04 WSL2/ext4 control, `d028df2`    | GO for targeted process, nested execution and ownership acceptance | Not Windows-mounted DrvFS, Docker, model inference or all WSL versions                                 |
| Windows PowerShell 5.1, Claude/Gemini/Codex  | Measured CLI subsets in individual consumer reports                | Native entry quoting/empty-argument differences; no universal argument parity                          |
| Windows Git Bash/MSYS2                       | Conditional actual Windows-provider CLI routing                    | MSYS conversion, shell PATH growth and where.exe disagreement; mintty/Windows Terminal gaps            |
| WSL2 Claude 2.1.318                          | Conditional CLI, lifecycle and mise                                | Onboarding cancellation did not settle in direct or routed controls; full authenticated TUI unaccepted |
| WSL2 Gemini 0.67.0 / Codex 0.166.0           | Conditional native Linux CLI routing                               | Mature TUI, inference and shared authenticated state unverified                                        |
| Codex restricted child sandbox, Windows/WSL2 | Native and routed prerequisite checks                              | BLOCKED elevated/MXC or bubblewrap backend; semantic child task NOT TESTED                             |
| Native provider policy hooks                 | None validated                                                     | Mock `agent.beforeSpawn` is not provider enforcement                                                   |

Original reports and exact versions/dates are linked from the
[validation index](validation/README.md). Later WSL2 routing does not supersede
Windows failures; later Windows PTY isolation does not repair a provider TUI.

The F1-F5 controlled Avast comparison changed that PR's recommendation to
CONDITIONAL GO, followed by environment-limited Windows acceptance. It did not
prove active-Avast compatibility or causally close every historical executable lock
or npm-help incident. Keep [issue #25](https://github.com/Nickshajtan/hcc-harness/issues/25)
and the [historical investigation](stabilization-f1-f5.md) visible. The earlier
FS-1.2 exFAT execution/sharing failures remain historical evidence; later VS-1R
NTFS-installation/exFAT-consumer results qualify that scope, not every exFAT device.
