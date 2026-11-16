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

Packages resolve through a physical ESM anchor at the canonical project root:
`.arch-middleware-resolver-v1.mjs`. First enabled package use publishes fixed bytes
atomically with an exclusive temporary file and no-replace hard link. Subsequent
invocations verify bytes and file type without writing. Concurrent publication
accepts only a byte-identical regular file. Edited files/symlinks fail closed.
Native ancestor `node_modules` traversal remains Node's normal behavior.

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

## Evidence and implementation references

[Loader](../../src/middleware-loader.ts), [resolution](../../src/middleware-resolution.ts),
[configuration](../../src/config.ts), [usage](../usage.md#external-middleware-v1),
[real CLI/types tests](../../tests/integration/external-middleware.test.ts).
Node 24.19.0 experiments confirmed ignored arbitrary parents and native import
condition selection by a physical anchor. Tests cover import-only packages/subpaths.
This proves resolution, not native provider enforcement.

## Date and revision

2026-11-16. Historical research and validation retain their original scope.
