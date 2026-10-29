# Active M2.2 runtime portability design

**VERIFIED FEASIBILITY:** B1 prototypes and native runtime independence pass the
mandatory Ubuntu/macOS/Windows contract. **PLANNED / NOT TESTED:** B2 stable
installation, production bootstrap integration and migration. B2 requires explicit
approval; cleanup does not authorize it. See [testing and evidence](testing.md).

## Current behavior and separate runtimes

Production setup captures `process.execPath` and the checkout's absolute
`dist/cli.js`. Removing either breaks old route execution. `npm link` also depends
on the selected npm prefix and original checkout; a version-manager switch can hide
the management command independently of project routing. A working current Arch
can still status/deinit hash-valid old resources without executing their targets.
The [explicit recovery recipe](usage.md) preserves edited middleware configuration.

| Runtime    | Selection authority                                    | Isolation contract                                                 |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| Arch       | Explicit compatible Arch runtime or incoming PATH      | Must meet >=24.15.0 <25 without changing project selection         |
| Project    | User shell/version manager/project config              | May select Node 20/22 independently                                |
| Native CLI | Native executable/shebang/supported npm-shim semantics | Keeps incoming native environment, never silently uses Arch's Node |

The approved B1 production correction is limited to Windows npm Node selection:
standard adjacent Node or native PATH, never `process.execPath`/`ARCH_NODE` as a
fallback. Core, EDA, middleware APIs and process cancellation/stdio contracts remain
unchanged. The independent bootstraps are **not** installed by npm or emitted by
setup. Direct Node/npm-bin invocation has no new pre-import engine guard yet.

## Chosen direction and rejected alternatives

| Option                            | Decision and trade-off                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| PATH Node only                    | Simple, but fails with project Node 20/22; insufficient alone                                                                         |
| Implicit mise execution/discovery | Reject: manager/config/download coupling and possible native PATH changes                                                             |
| Arch-managed Node copy            | Reject: security updates and lifecycle become a custom runtime manager                                                                |
| Independent narrow bootstrap      | B1 demonstrates explicit override + first PATH policy without native environment substitution; does not alone solve checkout location |
| Stable app plus narrow bootstrap  | Preferred B2 direction, subject to approval and complete installation evidence                                                        |

`ARCH_NODE` is an **explicit absolute executable override**, not manager discovery.
An invalid, empty, missing or incompatible override must fail without fallback.
Otherwise choose the first PATH Node, skipping exact marked router directories and
rejecting bootstrap/route aliases. Do not search later entries because the first
is incompatible. No implicit empty-entry/current-directory/system search, project
TOML lookup, registry/cache scanning or persistent runtime selection state.

Probe the selected executable directly, validate the exact engine range and fail
before loading harness code. Production integration needs bounded time/output and
an early conservative CLI guard before dynamic harness imports, including direct
Node/npm bin paths. Any bootstrap-host Node 20/22 re-exec path must be tested without
loading harness modules under that engine or weakening package engines. Diagnostics
identify the selection/version/range and manual repair, never dump the environment.

Never prepend Arch Node to PATH or transport saved native PATH through shared state.
Preserve incoming env/cwd/args and existing router filtering only. NODE_OPTIONS and
PATH are trusted user inputs, not a sandbox; version probing is not attestation.
Do not claim replacement-between-probe-and-launch races are solved by a transaction.

## Windows feasibility and Scoop decision

Keep existing Scoop route `.exe/.shim` pairs. The fixed-entry native prototype
`scripts/b1/arch-bootstrap.cpp` resolves Node and runs adjacent `dist/cli.js` with
CreateProcessW, inherited console/handles/env/cwd, quoted argument arrays, a bounded
128-byte/3-second probe, direct child status and job lifetime handling. It uses
static CRT and console subsystem; build scripts compile from source with `/W4 /WX`.
It is not a generic Windows process launcher and is not a checked-in vendor binary.

The exact [Scoop cpp/v0.3.0 source](https://github.com/ScoopInstaller/Shim/blob/cpp/v0.3.0/cpp/shim.cpp)
and vendored executable were investigated: `%ARCH_NODE%` expansion works but runs
unsupported Node 20 as well as Node 24; it cannot enforce version compatibility or
the conditional override/strict-PATH policy. Its implicit executable search also
includes non-PATH locations. Retain Scoop unchanged for routing rather than extend
it into a runtime resolver. The small native bootstrap remains the feasible option.

The POSIX test-only shell entry ends in `exec` with `"$@"`. Both prototypes execute
real subprocesses in tests; routing fixture rewrites are deliberately outside valid
ownership manifests. Separate normally initialized fixtures prove safe deinit/init.

## Stable installation: npm first, not a custom snapshot framework

Before a custom installer, evaluate standard npm:

```text
npm pack
npm install --global --prefix <explicit-stable-user-directory> <local-tarball>
```

This is a **B2 candidate, not an implemented installation procedure**. A pack dry-run
included built dist/vendor resources; it did not prove a self-contained install.
A tarball avoids linking an arbitrary development checkout. Keep `private: true`,
the existing bin and development `npm link`; no registry publishing or auto-updates.
Use per-command prefix, not global npm config or a universal nvm-prefix workaround.
Let npm own dependency/bin installation unless an executed contract proves it cannot.
The earlier custom-copy snapshot proposal is superseded as the preferred approach;
there is no demonstrated need for that installer.

Ordinary npm shims still need ambient Node. B2 must prove a stable independent entry
with compatible override and missing/incompatible project Node, and separate CLI
installation from project init. Destination/executable placement and safe removal
must be explicit; an occupied destination must not overwrite user-owned resources.
Users may choose an already-visible bin directory or use full paths. Do not promise
bare `arch` availability without a user PATH decision. No automatic profile/PATH
rewrite, runtime acquisition, package manager, updater, daemon or remote service.

## Migration and ownership requirements for B2

- Preserve M1/M2/M2.1 `{ files, createdHarness }` formats and recorded hashes;
  do not require renderer equality, JSON order or historical target availability.
- No silent migration during status/init/configure/CLI installation/update. Existing
  reconciliation retains old launcher bytes. Do not invoke `arch` by name from routes
  or create a new manifest pointer/transaction framework to bypass this.
- Explicit rebind uses working current Arch: inspect/record routes, finish recorded
  recovery, deinit --yes, then init those names with the selected installation.
  Modified managed files remain protected. Interrupted rebind can leave no routing;
  inspect and retry, never automatically chain past a failed removal.
- Preserve user-modified middleware byte-for-byte; unchanged generated defaults may
  be removed/recreated. Status availability warnings must not become ownership rules.
  Unknown hash-valid legacy launcher templates remain safely removable.
- Keep current journals, no-clobber hard-link publication and recovery checks;
  deinit can require links to finish pending reconciliation. exFAT stays unsupported.

## Remaining integration gates

B1 proves real compatible/unsupported runtime selection, original runtime removal,
checkout relocation recovery, native independence, args/env/cwd/stdio/exit, supported
console signals and terminal handles. Real offline mise link/exec switching is
distinct from PATH simulation. Important run links and reproduction are in
[testing](testing.md). Historical Windows executable evidence includes bootstrap
SHA-256 `92f27a929f437ddfbaeb1155d7c7c5a4ced6a13c2812306e014bcd20df07c826`.

Before B2 completion, execute self-contained tarball install and delete/relocate the
source checkout; update/reinstall/remove and version-manager prefix-loss/relink;
real manager selection without global edits; legacy modified-launcher refusal,
interrupted route/uninstall recovery, repeated deinit and explicit rebind; concurrent
projects on different native Nodes; full regression, wizard and mandatory matrix.
Record executable/build provenance and PASS / FAIL / NOT TESTED for each area.

Known limits: POSIX prototype probing is not timeout-bounded; both prototypes have
fixed range logic needing drift protection. Windows arbitrary cmd/PowerShell runtime
wrappers are not proved. Temporary app dependencies link back to the repository,
so source-deletion independence is unproved. Real nvm/fnm, Windows ARM64, every
terminal emulator and force-kill cleanup are unverified. The native bootstrap's
console/arguments/signals/status contract must continue to pass; otherwise stop for
review rather than substituting a generic launcher or weakening the contract.
