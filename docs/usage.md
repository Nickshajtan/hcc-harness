# Usage and recovery

This guide describes the implemented main-branch contract; validation is scoped in
the [capability matrix](capabilities.md). Installation prerequisites and npm
link/unlink are in the [README](../README.md); the stable installation and runtime
selection contract is in the [active design](runtime-portability.md).

## External middleware V1

Schema 1 accepts local ESM entrypoints and project-installed Node packages. Existing
`{ id, enabled }` entries and starter configuration keep their behavior. Older readers
reject these new fields; use a V1-capable installation.

### Configuration locations and ownership

Runtime discovery walks from the invocation directory toward its ancestors. At each
project root it checks, in order: `.hcc/harness.toml`, `.hcc-harness/harness.toml`,
`.arch/harness.toml`, `.ai/.harness/harness.toml`, `.ai/arch/harness.toml`. The nearest
root with one configuration wins. Two or more candidates at that root are an error,
listed in that order; precedence never silently hides another file. Files are never
merged, and an invalid selected file fails without falling back to a parent.

Trusted integration callers may set `execute({ configurationDirectory: '.ai/arch', ... })`
or import `discoverConfiguration` from `arch-harness/core` and call
`discoverConfiguration(cwd, '.ai/arch')`. The selector is one of the five directory names above, searched at each
ancestor; no other candidate is used. A missing explicit selection throws, rather
than disabling middleware. If the nearest project has another candidate, the missing
selection fails there; it never crosses that project to use a parent's file.
Same-root conflicts still fail with a selector.
Parsed policy callers may supply absolute `configurationDirectory` alongside
`projectRoot`; without it, package helpers default to `projectRoot/.arch`.
Never derive either field from provider requests.

`arch init claude codex` defaults to `.arch` for a new project.
`arch init claude codex --config-dir .ai/arch` explicitly selects another supported
home, including with interactive init. Existing configuration selects the home for
all subsequent management commands. Management resolves the nearest project from
cwd, including invocation from subdirectories. An explicit selection cannot cross
that project boundary or change an existing home. There is no implicit migration.
Explicit-root programmatic lifecycle APIs continue to target exactly the supplied root.
Project identity is the containing root, never `.ai` or the configuration directory.

```text
project/
  .ai/arch/                 # alternatively .hcc, .hcc-harness, .arch, .ai/.harness
    harness.toml           # declarative configuration
    modules/policy.mjs     # executable trusted JavaScript, explicitly referenced
    .internal/resolver-v1.mjs  # native ESM helper, only needed for packages
    bin/                   # generated routes and exact router marker
    bootstrap.json         # recorded routing hashes and config ownership
    routing.json           # only while routing recovery is pending
    uninstall.json         # only while removal is pending
    setup-claim/           # only while setup is active or unresolved
  node_modules/            # ordinary project-managed dependencies
  .config/mise/conf.d/arch.toml  # external mise integration points to .ai/arch/bin
```

One selected home contains HCC resources; selection does not grant blanket deletion
permission. Arch removes only resources authorized by existing manifests and verified
hashes. User modules, modified/preexisting configuration, unknown residue and the
verified resolver helper remain. Deinit does not remove `.ai` or recursively remove
any selected directory. Mise is the external integration exception and retains its
normal trust/activation semantics. No additional PATH or shell integration is installed.

Recovery uses the same home's claims, journals and private stages, even if configuration
is missing or invalid. Invalid configuration never enables runtime fallback to another
configuration. Management can inspect routing ownership and perform ownership-checked
cleanup without executing middleware. Evidence in multiple homes is a conflict,
including a pre-consolidation split layout; preserve both and resolve it manually.
No automatic migration or adoption is attempted. A local file
source in the layout above is `source = { file = "./.ai/arch/modules/policy.mjs" }`.

```toml
schema = 1

[[middleware]]
id = "project-dlp"
enabled = true
required = true
source = { file = "./.arch/modules/dlp/index.mjs" }
options = { mode = "strict" }

[[middleware]]
id = "finops"
enabled = true
required = false
source = { package = "@company/hcc-finops" }
options = { mode = "strict" }
```

File paths are relative to the project containing the discovered `harness.toml`,
even for nested invocations. Use complete `./` paths ending in `.mjs`, or `.js` with
a nearest in-project `package.json` declaring `"type":"module"`. Files must remain
inside the root after lexical and realpath checks. Directory imports, implicit
extensions and escaping symlinks fail. Spaces, Unicode, `#` and `%` are literal filename
characters handled by file URLs. Git clones/submodules, deployment tools and copying
are valid delivery methods; Arch does not manage them.

Save this working demonstration as `.arch/modules/dlp/index.mjs`:

```js
export const abi = 1;
export function createMiddleware({ id, options }) {
  return {
    id,
    register(api) {
      api.on('preflight', () => {
        if ('strict' !== options.mode) {
          throw new Error('This example requires strict mode');
        }
      });
    },
  };
}
```

A package uses the identical module. Put that example in `packages/hcc-finops/index.mjs`
alongside this `package.json`, then use ordinary tooling: `npm install ./packages/hcc-finops`.

```json
{
  "name": "@company/hcc-finops",
  "version": "1.0.0",
  "type": "module",
  "exports": { ".": { "import": "./index.mjs" } }
}
```

Arch never installs packages. Names/exported subpaths use native ESM import conditions
from the canonical project root, including normal ancestor `node_modules` traversal.
Use isolated projects/lockfiles for reproducibility. There is no Arch-installation,
global, PATH, cwd or missing-file-to-package fallback. Built-ins, `#imports`, URLs and
malformed specifiers are rejected. Examples are demonstrations, not DLP/FinOps logic.

### Package resolution and deployment

First enabled package use atomically publishes `.internal/resolver-v1.mjs`
beneath the selected configuration directory (requires that directory to be writable
and a hard-link-capable filesystem). No helper is created at the project root.
Later invocations verify it without writing. For read-only deployment, provision a
regular non-symlink file with exactly these UTF-8 bytes and the trailing LF:

```js
export const resolvePackage = (specifier) => import.meta.resolve(specifier);
```

It is project-owned auxiliary state outside routing manifests, retained on deinit.
Arch never overwrites edited/foreign bytes. Interrupted publication can leave a
uniquely named `.tmp` sibling; it is never imported and the owner may inspect/remove it.
Disabled/file-only entries create no anchor. Middleware authors need no custom resolver.
The relocated helper needs no supporting files. Native ancestor lookup reaches the
project's package scope; intervening `node_modules` or `package.json` beneath the root
would shadow it and are rejected. The helper directory must remain canonically inside
the project. Read-only or non-hard-link deployments must pre-provision the directory
and verified helper; there is no non-atomic fallback. Old root helpers are never used
or deleted automatically; their owner may remove them after upgrading.

### Authoring and failure contract

Build this private repository with `npm run build`, run `npm pack`, and install the
tarball as an authoring-project development dependency. The artifact includes the
declaration closure; no registry publication or separate runtime SDK is needed:

```ts
import type {
  ArchMiddleware,
  MiddlewareAPI,
  PolicyAPI,
  MiddlewareFactoryInput,
  MiddlewareModule,
} from 'arch-harness/middleware';
```

Require named `abi = 1` and callable `createMiddleware`. Factories return synchronously
with the configured ID, callable `register()` and optional callable `registerPolicy()`.
Policy-only modules expose a no-op `register()`. Async work belongs in hooks/handlers.
External `register()` and `registerPolicy()` must return `undefined` synchronously;
returned Promises/thenables are registration failures, with genuine rejections observed.
Legacy process registration keeps its existing return-value behavior.
Each external process registration has its own synchronous admission window, closed
on return or throw. Later `on()` and `cleanup()` calls throw and cannot install callbacks.
Cleanup legitimately registered before a failure still runs under the existing lifecycle.
Options are recursively frozen finite numbers, strings, booleans, arrays and tables.
The TypeScript JSON type also permits null; TOML has no null literal. Date/time values
and nonfinite numbers fail. Modules validate their own option meanings.
Unknown fields, duplicate IDs (including disabled), mixed source kinds and external-only
fields without a source fail configuration. External IDs cannot overwrite base registry IDs.

| Failure                                                  | `required = false`                 | `required = true` (default)        |
| -------------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| Resolution/import, ABI/export, factory/instance contract | Skip with diagnostic               | Stop                               |
| Malformed config, duplicate ID, registry collision       | Stop                               | Stop                               |
| Registration, hooks/handlers, invalid decision, cleanup  | Existing fatal lifecycle semantics | Existing fatal lifecycle semantics |

Disabled entries never resolve/import/construct. Optionality ends before registration;
there is no partial-registration rollback. `requiredPolicies` always wins over optionality
and still requires an applicable handler. Instances are fresh per execution/dispatch;
module-level state is shared/cached by Node, including concurrent invocations. Restart
the host after updates. No cache busting or hot reload is provided.

Diagnostics contain ID, configured source, URL when available, stage, stable code and
skip/failure disposition, without options or raw exceptions. Default local output is
stderr (`[arch:middleware]`). `ExecuteOptions.reportMiddlewareDiagnostic` and
`PolicyDispatchOptions.reportMiddlewareDiagnostic` accept synchronous local sinks;
a failing sink blocks progress. Required errors retain causes locally.

`arch-harness/middleware-loader` exports `loadMiddleware(configuration, baseRegistry,
report?, { preparationTimeoutMs?, requiredPolicies? })`, returning registry, effective
configuration and diagnostics. Later factory
construction can append diagnostics. Prefer integrated `execute()` (`arch-harness/core`)
or `dispatchPolicy()` (`arch-harness/policy`). Do not pass an already extended registry
with source-bearing config through preparation twice: collisions fail closed.

Modules are trusted JavaScript with host privileges. Entrypoint containment is not a
sandbox and does not restrict dependencies. `ExecuteOptions.preparationTimeoutMs` and
`PolicyDispatchOptions.preparationTimeoutMs` configure a separate shared preparation
budget (default 5000 ms, integer 1–60000), also available on the loader's fourth argument.
Modules resolve/import sequentially using the remaining budget, never a new full budget
per module. Timeout emits code `preparation-timeout`: optional entries skip, required
entries fail. Policy-required entries fail even if optional. After budget exhaustion,
later external entries are not started. Disabled entries still perform no preparation.

This bounds asynchronous waiting, **not JavaScript execution**. Late imports cannot
install factories or register callbacks; late rejections are observed. Evaluation may
still continue and retain side effects, resources or cached module state. A timer cannot
interrupt CPU-blocking code, terminate top-level await or bound synchronous factories.
Preparation precedes the separate policy decision deadline, which is not extended.
No hard cancellation or native provider enforcement is implied.
See [policy integration](provider-policy.md#external-module-integration-v1).

## Commands and interaction

Management commands operate on the current directory as the project root; they do
not walk upward and mutate a parent installation. Runtime middleware discovery does
walk ancestors. Always change to the intended project root before managing routes.

| Command                               | Behavior                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `arch init [commands...]`             | Explicit names initialize without prompts; bare init requires a terminal wizard |
| `arch configure [commands...]`        | Explicit names replace the desired set; bare configure opens the terminal menu  |
| `arch route list`                     | Read-only configured names, one per line                                        |
| `arch route add/remove <commands...>` | Add/remove while retaining other routes; idempotent                             |
| `arch status [--json]`                | Read-only installation, recovery and activation observations                    |
| `arch deinit [--yes]`                 | Confirmation defaults to No; outside a terminal requires `--yes`                |
| `arch uninstall [--yes]`              | Deprecated prompt-free compatibility alias, including recovery                  |
| `arch run <command> -- [args...]`     | Explicit harness dispatch to the native command                                 |
| `arch --help`                         | Command help                                                                    |

Names start with a letter and contain letters, digits, `_` or `-`. `arch`, `node`
and `mise` are reserved. Windows identity is case-insensitive. Custom/missing tools
may be configured before installation. Removing the last route is refused; deinit
instead. Repeating init with unchanged commands validates ownership without rewriting.

The wizard suggests installed tools without executing candidates or reading
credentials. Numbered choices and custom names lead to a final confirmation.
EOF, Ctrl+C and cancellation before applying write nothing. It manages routing,
not middleware settings. Every operation has a deterministic equivalent: explicit
init/configure names, route add/remove, status and deinit --yes.

Success or deliberate cancellation exits 0; operational/state errors exit 1;
invalid usage or missing noninteractive decisions exit 2; interactive SIGINT exits 130. Native dispatch preserves native exit/signal behavior.

## Installation versus activation

`initialized` means the owned files are valid on disk. It does not prove mise trust,
shell hooks, aliases/functions or actual parent-shell command resolution. JSON
status leaves `activation.shellActivation` as `"unknown"` and reports observations
such as mise availability and project-bin presence on PATH. Init can succeed without
mise installed. `mise exec -- <command>` activates routing for that subprocess;
ordinary commands require the user's shell activation/trust and prompt refresh.

## Middleware configuration

New starters use `schema = 1` and `middleware = []`. Explicit demo opt-in example:

```toml
schema = 1

[[middleware]]
id = "demo"
enabled = true
```

The nearest ancestor configuration wins, including subdirectories. A nested file
replaces the whole parent configuration. Adjacent projects are independent. Missing
configuration runs native with an empty middleware pipeline and its own execution
events; invalid configuration or unknown enabled middleware fails explicitly. TOML list order is execution order; `middleware = []` still
activates the lifecycle. Route changes never rewrite this file.

`ARCH_TRACE=1` enables local lifecycle JSON/demo diagnostics on stderr, without
argument/environment dumps. `ARCH_DEMO_DENY=1` deterministically denies demo launches.
These are local controls, not provider configuration. Registering trusted middleware
is covered in [architecture](architecture.md).

## Ownership and interrupted operations

Status derives `uninitialized`, `initialized`, `recovery_pending` or `invalid_state`
from ownership and journals; it never performs recovery. Modified managed bytes,
unsafe paths, conflicting journals and unexplained missing files block mutation.
Never delete ownership evidence or substitute today's generated bytes to bypass
checks. Restore known matching bytes or inspect the reported paths before retrying.

The examples below use the default `.arch` home; substitute the selected home for
every project-local path (including claims and private stages).

- `.arch/uninstall.json`: the verified bootstrap is renamed here before removal.
  Retry `arch deinit --yes` (or legacy uninstall). Only this checkpoint permits
  already-removed managed files; remaining files must still match. It is removed
  last; initialization refuses pending recovery. Repeated deinit is safe.
- `.arch/routing.json`: retain the journal/staging files. Inspect `arch status
--json`, then retry `arch configure <recorded-desired-commands...>` after resolving
  capability/permission problems. A different desired set is refused until recovery
  finishes. Deinit first completes the recorded route update, then removes it.
- Partial private staging: preserve mismatched bytes; the journal records expected
  payloads for deliberate restoration. An orphan `.arch/routing.stage` left before
  journal publication has no ownership proof: inspect and move it aside manually.
  Fresh-init termination before bootstrap publication can likewise need manual
  inspection; ordinary caught-error rollback is not crash-atomic initialization.

Deinit removes the starter middleware file only when Arch created it and it remains
unchanged. Edited/preexisting configuration and unrelated files survive; empty
directories can remain. Refresh the shell prompt after removal. Pending route
recovery may require publication even during deinit (native helper on Windows x64,
hard links on POSIX); see [compatibility](compatibility.md).

## Missing historical Node or moved checkout

Development-generated routes capture absolute Node/checkout paths. Stable-generated
routes point to their installed independent bootstrap, which selects Arch Node
at invocation time using explicit `ARCH_NODE` or the first eligible PATH Node. Missing targets do
not invalidate matching ownership hashes and do not authorize rewriting/deletion.
Use a working current Arch checkout with compatible Node, without running the old
launchers:

```sh
node /path/to/current/arch/dist/cli.js status --json
# Record routes, and resolve any pending recovery before continuing.
node /path/to/current/arch/dist/cli.js deinit --yes
node /path/to/current/arch/dist/cli.js init claude codex
```

Replace example names with the recorded routes. This explicit rebind is not atomic:
interruption between deinit/init leaves routing absent; inspect state and retry init.
Edited middleware bytes survive deinit/init; unchanged generated defaults may be
removed/recreated. Modified managed launchers still block removal. CLI link loss
after a Node-prefix switch needs explicit relinking with a working checkout, not
automatic runtime discovery. `ARCH_NODE` applies to the stable bootstrap; it cannot
repair development-generated launchers that directly reference a missing Node.
There is no automatic migration or rebind API.

## Signals and nested execution

On POSIX, Arch spawns its direct child without detachment, with inherited stdio
and process group. Once spawn has been initiated, Arch ignores SIGINT itself:
the foreground terminal delivers Ctrl+C to the group, including the child.
Arch neither forwards another SIGINT nor starts a SIGINT escalation timer.
Interactive children can cancel an operation and continue. Arch waits for actual
settlement, finalizes once, and preserves the child's exit code or signal.
Before spawn, SIGINT still cancels preparation and runs applicable cleanup.

A SIGINT sent only to the Arch PID after spawn does not reach the child and does
not stop Arch. Use SIGTERM for programmatic termination. Arch does not infer
signal origin. SIGTERM/SIGHUP retain direct-child forwarding and the existing
three-second escalation. Explicit library AbortSignal cancellation retains its
existing direct-child cancellation contract. Windows console handling is unchanged.
Detached children/separate process groups are not launch options in this process
model; descendants independently created by native providers remain their responsibility.

Every invocation, including `Arch -> provider -> Arch -> provider`, creates a
fresh execution ID, middleware pipeline, event bus, outcome and cleanup scope.
Unconfigured invocations also emit their own execution events, with an empty
middleware pipeline and cwd as project root. `ARCH_ACTIVE` identifies the current
execution in its child's environment; it no longer prohibits nested execution.
Arch sets `ARCH_PARENT_EXECUTION_ID` to its ID for its child. A subsequent Arch
accepts a bounded UUID-shaped value as optional parent correlation, publishes it
as additive `parentExecutionId` on schema-1 events, and allocates a new ID.
Invalid metadata is ignored; a valid-looking forged ID is still untrusted.

Correlation grants no authorization, ownership, budget or sandbox privileges.
Configured middleware runs independently at each level. No mutable middleware
state is shared. An invocation is not a model request: future Budget Guard work
must distinguish execution IDs, model request IDs, parent relationships and
billable operations, without disabling nested middleware or changing accounting here.

Native resolution filters marked routing directories, resolves symlinks before
checking executable identity, and refuses recognized generated launcher shapes
and Arch's CLI target. Windows npm shim destinations receive the same identity
checks. If no native target remains, resolution fails rather than falling back
to Arch. Arbitrary third-party wrapper behavior cannot always be proven statically;
intentional script reentry is permitted and is not agent ancestry detection.
Relative operands in foreign wrappers are left to the native program, rather than
being interpreted against Arch's own cwd.
Native PATH remains filtered as before, so a provider wanting explicit nested
routing can invoke the installed Arch entry with `run <provider> -- ...`.
An absolute native provider invocation can bypass PATH routing and middleware.
Arch is a process router, not a mandatory interception or security boundary.

## Recovering an interrupted init

An unresolved `.arch/setup-claim` means the setup invocation did not finish
verified commit or verified rollback. It may have died before recording any
manifest. A manifest at the expected path alone does not prove it belongs to
that setup: another writer may have won publication. Init retries, routing
mutations and deinit therefore fail closed. Ordinary operations never remove
this claim automatically. There is no automatic setup recovery command.

Stop concurrent setup/lifecycle writers first. Preserve evidence and run
`arch status --json` from the project root. Status remains read-only, returns
nonzero for invalid ownership state, and adds a `setup` object containing
`claimPresent`, `bootstrapPresent`, `stagingPaths`, `manualRecoveryRequired` and
`documentation`. Text status includes the inspection paths and documentation
reference. Entries are observations, never deletion authorization. No stage or
configuration contents are exposed by these diagnostics.

Inspect `.arch/bootstrap.json` as data, without executing any launcher. Its
`files` map records generated route/marker/mise paths and their SHA-256 hashes;
`createdHarness` records whether setup created the starter. Check the complete
manifest format and expected route set, including platform-specific exe/shim
pairs. Reject symlinks, unexpected paths, conflicting journals and foreign or
modified resources. Compute SHA-256 over each file's exact bytes (for example
`Get-FileHash -Algorithm SHA256 -LiteralPath <file>` on PowerShell or
`shasum -a 256 <file>` on macOS); do not normalize newlines. Compare with recorded
hashes, but remember that a hash match alone does not establish provenance.

List private `.arch/.setup-*` directories without following links. Setup stages
use numeric names in publication order: generated resources, optional starter,
and bootstrap last. These names and matching contents are useful evidence but
do not authorize deletion. POSIX stages may remain hard-linked to published
files; Windows moves can consume stages and change file identities. There is no
durable stage-to-resource ownership journal for an interrupted initial setup.
Use independently captured setup records, pre-setup snapshots and exclusive
publication/file-identity evidence where available. Never infer ownership just
because a file occupies an expected generated path or resembles a launcher.

Choose only one of these outcomes:

1. **Retain a verified committed installation.** Establish that bootstrap was
   published by this setup, that every recorded resource is complete and hash-valid,
   and that the route set and starter provenance are correct. Preserve any existing
   user configuration. Remove only proven setup-owned staging residue after checking
   identity and bytes; stop if its origin is uncertain. Retain the verified bootstrap
   and generated files. Remove the empty claim directory last, then run status again.
2. **Roll back demonstrably setup-owned resources.** With independent provenance
   and current identity/hash verification, remove only resources exclusively published
   by this setup, in reverse publication order. Preserve pre-existing/customized
   configuration and every foreign collision. Remove only proven private stages and
   the setup-owned bootstrap; remove the empty claim directory last. Verify status,
   then initialize again with explicit provider names.

If publication outcome, bootstrap provenance, stage origin, file identity or
ownership is ambiguous, stop and retain the claim and evidence for manual review.
Do not recursively delete `.arch`, blindly delete bootstrap, or delete foreign
resources because they occupy expected paths. A nonempty/substituted claim also
requires investigation. This procedure does not weaken FS-1.2 no-replace publication.

## Generated artifacts and starter middleware

`.arch/bin/*` launchers are machine-local installation artifacts. POSIX scripts
capture absolute Node/CLI paths for development installs or the stable entry path
for stable installs. Windows `.shim` files capture the corresponding absolute
paths; their companion `.exe` files and `.arch-router` marker form the route set.
`.arch/bootstrap.json` records ownership hashes for that local installation.
`.config/mise/conf.d/arch.toml` uses `{{config_root}}/<selected-home>/bin` (`.arch/bin`
by default); it is
still generated installation integration, not portable team configuration.
Stable entries bind routes to an installation identity; copying routes does not
relocate or rebind that installation.

Do not commit generated routes, ownership manifests, claims or private stages as
portable project configuration. Each contributor installs Arch and runs `arch init
<providers...>` locally. Decide source-control ignore rules explicitly; Arch does
not modify `.gitignore`. A deliberately maintained middleware configuration can
be shared independently of generated routing artifacts. To recreate routes, inspect
ownership, complete any recovery, safely deinit, then initialize using the intended
installation. Modified or foreign resources must be resolved without deleting them
blindly. Relocation and automatic migration are unsupported.

New generated `.arch/harness.toml` contains `schema = 1` and `middleware = []`.
Demo remains an explicit example: to opt in use the repository demo configuration
(`[[middleware]]`, `id = "demo"`, `enabled = true`). Demo can inject `ARCH_DEMO=1`
and deny on `ARCH_DEMO_DENY=1`; ordinary routing does neither by default.
For older projects intentionally replace the middleware list with `middleware = []`
or disable the demo entry. No automatic migration occurs. Deinit recognizes exact
unchanged legacy and new generated starter bytes only when `createdHarness` records
ownership. Customized starters and foreign configurations are preserved.

## Choosing a process or policy extension

The default CLI registry contains only `demo`. A TOML ID does not import a module:
library callers supply a trusted factory registry to `execute()` or `dispatchPolicy()`.
Process extensions use `register()` and the three process phases; provider decisions
use synchronous `registerPolicy()` and asynchronous handlers. The latter does not
receive execution context or environment mutation. See the
[policy API and fictional example](provider-policy.md); its mock executable is not
an `arch` subcommand and does not create a native provider subagent.
