# Active M2.2 runtime portability design

**VERIFIED FEASIBILITY:** B1 prototypes and native runtime independence pass the
mandatory Ubuntu/macOS/Windows contract. **IMPLEMENTED / VALIDATING:** B2 stable
installation and production bootstrap integration. Migration is not in B2. B2 implementation is
authorized; authorization does not establish readiness or passing acceptance.
The scope corrections below override conflicting earlier requirements. B2 hosted
acceptance must be inspected at the implementation commit; B1 evidence alone is insufficient.
See [testing and evidence](testing.md).

## B2 scope and acceptance corrections

The B2 end-to-end contract is:

```text
Stable installation -> Runtime bootstrap -> Arch execution core
                    -> Project routing -> Controlled native CLI fixture
```

Use controlled, deterministic fixture executables and supported npm shims. Real
AI CLI integration is out of scope: do not install, configure, authenticate or
execute Claude Code, Codex CLI, Gemini CLI or other real AI agent CLIs. Do not
require provider credentials or add provider-specific adapters, policies or
behavior. Authentication, API availability, model behavior, rate limits and usage
costs must not block B2.

B2 acceptance requires verified stable installation, independent bootstrap,
source relocation, isolated native fixture execution, safe installation conflict
handling and runtime/version resolution. Required Windows, Ubuntu and macOS CI
must pass; existing quality, security, ownership and recovery contracts remain
binding. Full complexity review below is also required. Real AI CLI execution is
not an acceptance criterion. Authorization does not close the historical Windows
incidents or waive their evidence requirements.

### Mandatory complexity review

Before implementation, reproduce `npm run lint:report` and inspect the complete
current report, rather than assuming the historical 43 findings still apply.
Preserve the starting report and record the exact source commit. Repeat at the
implementation commit with the same analysis scope; no finding may disappear
because its file was excluded.

Keep the complete per-finding inventory in the maintained
[quality baseline](standards/quality-baseline.md), or a machine-readable report
linked from it. Each record must identify file/function, rule/metric, measured
value, applicable threshold, root source of complexity, correctness/maintainability
risk, recommended treatment, decision and rationale. Classify each finding:

- **FIX NOW:** local, safe improvement with meaningful readability or correctness benefit.
- **DEFER:** legitimate issue requiring larger architecture work, contract changes or disproportionate effort; explain the constraint.
- **ACCEPT:** complexity justified by its responsibility and protected by identified tests; explain why simpler alternatives would not improve it.

The final review must report before/after totals and breakdowns by complexity,
nesting, parameters and length; fixed and newly introduced findings; remaining
findings grouped by severity and module; the top five maintainability risks;
explicit reasons for accepted complexity; and justified future corrections.
Metrics are review triggers, not automatic failure counts. An unexplained new
high-risk finding fails acceptance. Cosmetic extraction, moving complexity into
helpers to hide findings and generic metric-driven abstractions are prohibited.

### Subsequent milestones (not B2)

M2.5 is Cross-Environment Compatibility Hardening: WSL2 Ubuntu, Docker Ubuntu on
Windows/macOS, native Ubuntu/macOS and platform-specific filesystem/runtime
contracts. A separate First Real AI CLI Integration vertical slice begins with
one real CLI, validates actual terminal/subprocess behavior, runtime isolation,
interactive execution, cancellation and events, then considers additional CLIs.
Their order requires separate prioritization and authorization. Neither is part
of B2.

## Current behavior and separate runtimes

Development setup captures `process.execPath` and the checkout's absolute
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
unchanged. Stable initialization now emits bootstrap-bound routes. Development
initialization preserves historical captured bytes. Direct Node/npm-bin invocation
validates the executing Node before dynamically importing the application.

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
POSIX retains B1's conservative refusal of directories containing `.arch-router`;
Windows matches the exact marker bytes. POSIX resolves file symlinks with the OS
`/usr/bin/readlink` (at most 32 hops) and checks the physical parent to reject routed
runtime aliases. The selected runtime is a trusted executable, not attested code.

Windows probes the selected executable directly with B1's bounded time/output.
POSIX execs the selected Node into the conservative CLI guard, which validates the
actual executing version before dynamic harness imports. It has no external version
probe to hang, and no re-exec subprocess or PATH substitution. Node 20/22 can load
the guard and fail before application imports; engines are not weakened. Diagnostics
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
B2 compiles the same source with `ARCH_STABLE`, selecting `application/dist/cli.js`
and requiring the stable completion marker. B1's fixed entry is unchanged.

The exact [Scoop cpp/v0.3.0 source](https://github.com/ScoopInstaller/Shim/blob/cpp/v0.3.0/cpp/shim.cpp)
and vendored executable were investigated: `%ARCH_NODE%` expansion works but runs
unsupported Node 20 as well as Node 24; it cannot enforce version compatibility or
the conditional override/strict-PATH policy. Its implicit executable search also
includes non-PATH locations. Retain Scoop unchanged for routing rather than extend
it into a runtime resolver. The small native bootstrap remains the feasible option.

The POSIX test-only shell entry ends in `exec` with `"$@"`. Both prototypes execute
real subprocesses in tests; routing fixture rewrites are deliberately outside valid
ownership manifests. Separate normally initialized fixtures prove safe deinit/init.

## Stable installation contract

Install from a bootstrapped checkout:

```text
npm run install:stable -- --destination <absolute-directory>
```

The directory must be absent, absolute, and have an existing nonsymlink parent
chain. No default destination or global configuration is inferred. Windows builds
require x64 Visual C++ tools/SDK; `ARCH_WINDOWS_SDK` selects an installed SDK.
Windows ARM64 routing artifacts are included, but independent ARM64 bootstrap
execution is not supported by this build. Use `npm.cmd` in Windows PowerShell 5.

Standard npm global-prefix/tarball installation was compared against a narrow
snapshot: its npm shims still require ambient Node and it cannot publish the
independent native entry and readiness boundary. B2 keeps npm responsible for
production dependency closure (`npm ci --prefix <snapshot/application> --omit=dev
--ignore-scripts --no-audit --no-fund`), while a small explicit installer copies
built JS and vendor resources. No package resolver, updater or migration engine is
implemented. npm may use its normal cache/registry for these declared dependencies;
no Node runtime or AI CLI is installed. `private: true`, npm bin and development
`npm link` remain intact.

```text
<destination>/
  arch.exe OR arch          # independent entrypoint
  installation.json        # installed resource hashes, kind and platform
  .arch-ready/             # exclusive completion publication
  application/
    package.json           # runtime metadata, without dev dependencies/scripts
    package-lock.json      # dependency provenance; dev lock metadata is not installed code
    LICENSE                # Arch attribution; vendor/dependency attribution stays with resources
    dist/                  # built JavaScript only
    node_modules/          # npm production closure; no links to checkout
    vendor/                # both supplied Scoop architectures and attribution
```

Validation checks ancestors, then exclusive `mkdir` reserves the destination
(POSIX mode 0700; Windows inherits parent ACLs). Preparation occurs inside that
private reservation. Required files, real application imports/help and dependency
resolution inside the snapshot are verified. Symlinked snapshot resources and
source-path references are refused. Exact hashes are recorded before exclusive
creation of `.arch-ready` publishes completion. Entrypoints reject incomplete
installations. No directory rename can replace a late empty destination; no
cross-filesystem atomic rename or hard-link capability is needed for installation.
Routing reconciliation's hard-link requirement is unchanged.

After readiness publication, the installer invokes the actual installed entrypoint
with `--help` and the installation-time compatible Node supplied only to that
verification child. It reports success only after this passes. A failed self-check
reports the published stage and retains the complete but unverified snapshot;
it does not erase metadata or pretend success. This final invocation verifies the
real executable/permissions, which cannot be proved from copied file presence.

Normal interruption before readiness leaves a retained, non-runnable directory;
after readiness the complete snapshot is usable. The directory itself is visible
during preparation: this is readiness publication, not atomic directory visibility.
Power-loss/fsync durability is not promised. Failures retain their original cause
and stage. No rollback recursively deletes a potentially changed tree, so there
is no automatic cleanup/retry or cleanup error to conceal the primary failure.
Inspect retained files and choose a new destination. Removing retained or installed
directories is an explicit user action after checking no projects reference them;
there is no automatic stable uninstaller or update-in-place operation.

The destination parent and source build are trusted user-owned locations. Ancestor
checks and exclusive creation prevent ordinary collisions; they do not solve an
adversarial same-user symlink swap between filesystem calls. Protect parent access
and do not edit a snapshot during installation. Metadata/hashes are integrity
evidence, not cryptographic attestation or permission to delete unrelated files.

Ordinary npm shims still need ambient Node. B2 tests a stable independent entry
with compatible override and missing/incompatible project Node, and separate CLI
installation from project init. Destination/executable placement and safe removal
must be explicit; an occupied destination must not overwrite user-owned resources.
Users may choose an already-visible bin directory or use full paths. Do not promise
bare `arch` availability without a user PATH decision. No automatic profile/PATH
rewrite, runtime acquisition, package manager, updater, daemon or remote service.

## Existing state and ownership (no B2 migration)

- Preserve M1/M2/M2.1 `{ files, createdHarness }` formats and recorded hashes;
  do not require renderer equality, JSON order or historical target availability.
- No silent migration during status/init/configure/CLI installation/update. Existing
  reconciliation retains old launcher bytes. Do not invoke `arch` by name from routes
  or create a new manifest pointer/transaction framework to bypass this.
- B2 adds no migration, rebind API, conversion or orchestration. Unknown, ambiguous,
  incompatible, modified or partially owned state is preserved and unsafe mutation
  refused. Existing ordinary deinit/init behavior remains protected by tests.
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

Before B2 completion, execute the self-contained snapshot installation and
delete/relocate the source checkout; prove runtime replacement/removal and
invalid selection, modified-launcher refusal, interrupted route/uninstall recovery,
repeated deinit, native isolation, full regression, wizard and mandatory matrix.
Record executable/build provenance and PASS / FAIL / NOT TESTED for each area.

Known B1 limits: POSIX prototype probing is not timeout-bounded; both prototypes have
fixed range logic needing drift protection. Windows arbitrary cmd/PowerShell runtime
wrappers are not proved. Temporary app dependencies link back to the repository,
so B1 alone does not prove source-deletion independence. B2 installs real production
dependencies and tests actual source rename. Real nvm/fnm, Windows ARM64, every
terminal emulator and force-kill cleanup are unverified. The native bootstrap's
console/arguments/signals/status contract must continue to pass; otherwise stop for
review rather than substituting a generic launcher or weakening the contract.
