# FS-1.1 isolated native publication experiment

No production imports, installer changes, dependencies or automatic compiler installation.
Read [the decision record](../../docs/fs-1.1-native-publication.md) for scope and evidence.
The Windows binary exposes `move` (MoveFileExW with zero flags) and `handle`
(SetFileInformationByHandle/FileRenameInfo, ReplaceIfExists FALSE). Neither copies,
replaces, retries, or changes file contents. Only use disposable trusted regular files.
This research executable does not enforce Arch's path, stage hash or ownership policy.

## Windows build and run

Use Node 24.19.0, MSVC x64 build tools and a complete Windows SDK. The build script
discovers MSVC exactly as the existing bootstrap build does, but compiles a separate
binary. Output must be an owned experiment directory. The local default SDK was
incomplete; the following explicit SDK worked. Other machines can omit that option.

```powershell
powershell -NoProfile -File research/fs-1.1/build.ps1 -OutputDirectory .test-state/fs-1.1 -WindowsSdk 10.0.17763.0
Get-Volume | Select-Object DriveLetter, FileSystem
# Set these to existing trusted disposable parents, on the indicated real volumes.
$ntfsParent = $env:TEMP
$exfatParent = (Resolve-Path .test-state).Path
# Store stdout JSON outside the repository. Check $LASTEXITCODE after EACH Node command.
node research/fs-1.1/contract.mjs .test-state/fs-1.1/rename.exe $ntfsParent NTFS
node research/fs-1.1/contract.mjs .test-state/fs-1.1/rename.exe $exfatParent exFAT
node research/fs-1.1/integration.mjs .test-state/fs-1.1/rename.exe $ntfsParent $exfatParent
```

The contract runner creates an unpredictable `arch-fs11-*` child of its parent.
Only successful, owned fixture trees are deleted; failures retain the tree and
print its location. Native children have a 15-second failure deadline; it is not
a correctness delay or retry. Children use explicit stdin/IPC barriers, not sleeps.
Use a bounded outer test-job timeout as well. Filesystem labels are descriptive;
the runner does not detect filesystem type. Verify the volume inventory yourself.
Both sets must use the same binary and test source.

The helper prints `ready`, waits for the single byte `g` (without newline), invokes
the native operation, prints `{"error":<original OS number>}`, then waits for a
second input byte. This permits termination at genuine pre/post-operation checkpoints.
The `hold <file> shared|locked` mode holds a real read handle; `locked` omits
FILE_SHARE_DELETE. These are test-only modes. `--version` executes a published PE.

For a single noninteractive Node invocation, use
`execFile(absoluteHelper, ['move', absoluteStage, absoluteTarget, '--immediate'])`.
Exit 0 plus error 0 means native success; exit 1 plus a numeric error means native
failure; exit 2 is invalid usage. A killed/unstarted helper or malformed/missing
response is an **unknown outcome**, not proof that the rename did not happen.
The integration probe uses this exact protocol with a copied NTFS helper and an
exFAT consumer, without loading Arch or changing stable installation.

## Linux/macOS extension (not executed here)

The same source includes small native branches. These are unvalidated sketches,
not shipped implementations. On Linux use glibc >=2.28 and a supporting kernel/FS;
on macOS use the deployment SDK's declaration of renamex_np and RENAME_EXCL.

```sh
c++ -Wall -Wextra -Werror -O2 research/fs-1.1/rename.cpp -o /tmp/arch-fs11-rename
node research/fs-1.1/contract.mjs /tmp/arch-fs11-rename /tmp native-filesystem
```

Choose a unique owned binary output instead of that example if the name exists.
Linux/macOS run the common 44 scenarios, omitting Windows-only handle/executable
tests. Only the barrier protocol is implemented on these branches; the separate
Windows packaging integration probe is Windows-only. POSIX executable publication
mode/actual execution needs extension before platform acceptance. No fallback is
implemented for missing symbols, unsupported flags, EXDEV, or older filesystems.
