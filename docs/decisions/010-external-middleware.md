# ADR-010: Project-owned external middleware loading

## Status

Implemented for External Middleware Loading V1; acceptance depends on the PR's executed gates.

## Context

Independent modules need configuration-based loading without editing Arch's registry.
Node 24 imports resolve from the importing module, not the consumer's cwd. The
unflagged `import.meta.resolve()` ignores a second parent argument. CommonJS
resolution can choose different conditions and reject import-only packages.

## Decision

Extend schema 1 with explicit file/package sources, immutable JSON-compatible options
and external `required` (default true). Existing entries and generated defaults remain.
Local entrypoints must be inside the discovered root lexically and canonically.
Both distributions export named `abi = 1` and synchronous `createMiddleware({id, options})`.

The loader imports sequentially and prepares ordinary zero-argument Registry factories.
Existing process/policy loops own construction, registration, execution and cleanup.
Optionality ends before registration. Trusted `requiredPolicies` still require an
available matching instance with an applicable handler, including optional modules.
External process registration uses the policy engine's synchronous-return guard;
invalid async registration fails before launch and still cleans partial resources.
Legacy process registration is unchanged.

Packages resolve through a physical ESM anchor beneath the selected configuration directory:
`.internal/resolver-v1.mjs`. First enabled package use publishes fixed bytes
atomically with an exclusive temporary file and no-replace hard link. Subsequent
invocations verify bytes and file type without writing. Concurrent publication
accepts only a byte-identical regular file. Edited files/symlinks fail closed.
Native ancestor `node_modules` traversal remains Node's normal behavior. Intermediate
`package.json` or `node_modules` entries beneath the project root are rejected to
prevent changing the project resolution context. No supporting files are needed.

The anchor is project-owned auxiliary state outside routing manifests. Deployment
tooling can provision it for read-only roots. Arch never replaces or removes it;
deinit retains it and module sources. Management operations never import project code.
This avoids experimental flags, global hooks, child runtimes and author boilerplate.

`arch-harness/middleware` is a type-only facade over existing APIs plus the minimal
factory/options/ABI types. Local npm artifacts include declarations. Stable snapshots
remain runtime-only; authoring uses the npm artifact. No separate SDK is introduced.

## Consequences

Modules are trusted JavaScript with host privileges. Containment validates entrypoints,
not dependencies or privileges. Node caches evaluation; instances remain per dispatch.
Preparation is outside the policy decision deadline and cannot be hard-cancelled.
Waiting has a separate finite shared budget (`preparationTimeoutMs`, default 5000 ms,
integer 1–60000), covering sequential resolution/import. Required timeout fails closed;
optional timeout emits a skip unless the module is required by the current policy.
No late result can admit a factory and late rejections remain observed. Timers are
cleared on settlement; they cannot terminate top-level await, CPU-blocking code or
arbitrary JavaScript. Synchronous construction retains existing lifecycle ownership.
An adapter needing an end-to-end budget must refuse independently and never authorize
from late results. The mock keeps its bounded registry-only protocol.

Optional pre-registration errors emit sanitized local diagnostics. Reporter errors
block progress rather than hide skips. Registration, handlers and cleanup retain
existing fatal semantics. Duplicate IDs and base registry collisions fail before
imports, including disabled entries. No partial-registration rollback is introduced.

## Considered alternatives

Global plugin directories, scanning and implicit fallbacks obscure source selection.
Package management, SDKs and a second runtime duplicate Node/HCC responsibilities.
`createRequire().resolve()` does not preserve import conditions. Global hooks affect
unrelated concurrent imports. A manually authored resolver burdens each author;
rewriting it every execution prevents read-only deployment and adds needless effects.

## Configuration and admission amendment (PR #29)

Runtime discovery checks `.hcc`, `.hcc-harness`, `.arch`, `.ai/.harness`, `.ai/arch`
at each ancestor, in that order. One nearest configuration is used; multiple candidates
at the same root fail rather than merge or silently shadow. Invalid selected files
never fall back. Trusted callers may select one of these relative directory names;
a missing explicit selection fails at the nearest project with any candidate, never
crossing it to satisfy the selection in a parent. Parsed adapters supply absolute directory context.
Configuration paths do not redefine project identity or migrate `.arch/bin`, manifests
or mise integration. Init creates the `.arch` default only when no candidate exists.

`harness.toml` is declarative configuration; `.mjs`/ESM `.js` modules and the internal
resolver are executable code; `node_modules` is managed by the project. The helper is
outside routing ownership and retained on deinit. Read-only/non-hard-link deployments
must pre-provision its exact bytes and directory. Old root helpers are neither used nor
automatically removed. No project-root helper or second persistent resolver file is created.

External process API admission closes synchronously when that module's `register()`
returns or throws. Late hook and cleanup registrations fail, including after an async
register awaits a microtask. Earlier valid cleanups still run on registration failure.
Built-in admission behavior and the existing synchronous-return guard remain intact.

## Evidence and implementation references

[Loader](../../src/middleware-loader.ts), [resolution](../../src/middleware-resolution.ts),
[configuration](../../src/config.ts), [usage](../usage.md#external-middleware-v1),
[real CLI/types tests](../../tests/integration/external-middleware.test.ts).
Node 24.19.0 experiments confirmed ignored arbitrary parents and native import
condition selection by a physical anchor. Tests cover import-only packages/subpaths.
This proves resolution, not native provider enforcement.

## Date and revision

2026-11-16; correction amendment 2026-11-17. Historical research and validation retain their original scope.
