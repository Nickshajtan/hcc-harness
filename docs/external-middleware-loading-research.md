# HCC — External Middleware Loading Research

**Verdict: CONDITIONAL GO.** The existing factory registry and dispatch lifecycles support a small loader. Implementation needs two narrow additions: preparation of external factories and consistent handling of optional failures before registration. Shared-package resolution needs an explicit ESM resolution anchor.

**Baseline:** latest remote `main` at research time, `b423bc832749e1a07ada6b1a32cf6519fafc2281`. Its Git tree matches local HEAD `dfe33b5`, verified through the [remote comparison](https://github.com/Nickshajtan/hcc-harness/compare/dfe33b5dbb0a6b5ec9c53b22b5e6901ec9ccd688...b423bc832749e1a07ada6b1a32cf6519fafc2281). The research was read-only; this report was subsequently saved at the user's request. The pre-existing deletion of `docs/standards/complexity-inventory.json` was left untouched.

## 1. Current implementation map

All file references below apply to that baseline.

| Boundary                     | Verified implementation                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public process facade        | [`src/core.ts`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/core.ts) re-exports `execute`, `defaultRegistry`, and `ExecuteOptions`.                                                                                                                                                                                                           |
| Discovery and composition    | [`src/core/index.ts:9`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/core/index.ts#L9): `defaultRegistry` contains only `demo`; `execute()` discovers configuration and constructs an `ExecutionSession`.                                                                                                                                      |
| Process instantiation        | [`ExecutionSession.registerMiddleware()`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/core/execution-session.ts#L73) selects the supplied registry or default registry, skips disabled entries, calls factories in configuration order, validates instance IDs, and registers instances.                                                      |
| Process lifecycle            | [`ExecutionSession.run()`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/core/execution-session.ts#L34) starts observation, registers middleware, resolves/runs the child, then attempts finalization and cleanup.                                                                                                                              |
| Middleware contract/pipeline | [`src/middleware.ts:17`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/middleware.ts#L17): `MiddlewareAPI`, `ArchMiddleware`, `Registry`, and `createPipeline()`.                                                                                                                                                                               |
| Policy lifecycle             | [`dispatchPolicy()`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/policy.ts#L132) validates requests and requirements, creates instances independently, registers policy handlers, evaluates them, and runs reverse cleanup.                                                                                                                   |
| Policy contracts             | [`src/policy-contract.ts`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/policy-contract.ts): `PolicyAPI`, decisions, results, deadlines, and trusted `requiredPolicies`.                                                                                                                                                                       |
| Configuration                | [`parseConfiguration()` / `discoverConfiguration()`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/config.ts): strict schema 1 validation and nearest-ancestor discovery.                                                                                                                                                                       |
| CLI                          | [`runCommand()`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/cli/native-run.ts) calls `execute()`; [`main()`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/cli/main.ts) handles `arch run` and failure exit mapping.                                                                                                           |
| Policy adapter               | [`runMockHook()` / `evaluate()`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/mock-provider.ts) own capability checks, transport, safe serialization, and exit mapping. [`mock-provider-cli.ts`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/mock-provider-cli.ts) supplies a hard-coded demonstration registry/configuration. |
| Setup/defaults               | [`setup()`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/installation/setup.ts) validates existing configuration; [`manifest.ts:86`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/lifecycle/manifest.ts#L86) defines current empty and historical demo starter text.                                                            |
| Failure accumulation         | [`ExecutionFailures`](https://github.com/Nickshajtan/hcc-harness/blob/b423bc8/src/core/execution-failures.ts) preserves primary failure/stage and subsequent failures in observation order.                                                                                                                                                                   |

## 2. R1 — Registry and lifecycle

**Verified facts**

- `Registry` is already the required abstraction: `ReadonlyMap<string, () => ArchMiddleware>`.
- Both process and policy dispatch call factories separately for each invocation.
- `execute({ registry })` **replaces**, rather than merges with, the default registry.
- Registry selection currently occurs after awaited `execution.started` observers; an existing regression explicitly protects this timing.
- Policy dispatch has no default registry, filesystem discovery, or EventBus dependency.
- Neither pipeline currently imports external modules.

**Proposal**

Add one shared asynchronous preparation function that resolves/imports external modules and binds their factory options into ordinary zero-argument registry factories. Preserve Registry itself.

Use it:

1. Inside process session registration, **after `start()` and registry selection**, before registering instances.
2. Inside policy dispatch's protected lifecycle, after request/options validation.
3. Through a public loader export for callers that explicitly prepare registries.

Both paths should use the same small internal instantiation helper for external factory validation and optional factory failure handling. It may return “skipped”; the existing loops simply continue. It must not dispatch hooks, own cleanup, or replace either pipeline.

Do not instantiate modules during asynchronous preparation. Keeping construction in the existing registration loops preserves factory/registration ordering and cleanup of earlier registered middleware.

No external loading belongs in setup, status, route management, or the wizard.

## 3. R2 — Configuration and compatibility

**Verified facts**

`parseConfiguration()` currently:

- Requires numeric `schema = 1`.
- Allows only root fields `schema` and `middleware`.
- Allows only entry fields `id` and `enabled`.
- Requires unique lowercase IDs matching `^[a-z][a-z0-9-]*$`.
- Requires explicit boolean `enabled`.
- Defaults an omitted middleware array to empty.
- Freezes the returned configuration, entries, and array.

Discovery walks upward from resolved cwd and selects the nearest `.arch/harness.toml`. Only `ENOENT` permits continued discovery. Invalid nearest configuration fails closed; it does not fall back to an ancestor.

No harness schema migration mechanism was found. Setup validates and preserves existing configuration. New generated configuration enables nothing.

**Proposal: extend schema 1.** There is no demonstrated need for schema 2.

Add optional fields:

- `source`: explicitly discriminated file/package source.
- `options`: a TOML table with a documented JSON-compatible subset.
- `required`: boolean, default `true`, governing external loading/construction only.

Keep existing `{ id, enabled }` entries and their behavior unchanged. Reject external-only fields on entries without `source`, avoiding ambiguous built-in semantics.

```toml
schema = 1

[[middleware]]
id = "demo"
enabled = false

[[middleware]]
id = "local-audit"
enabled = true
source = { file = "./middleware/audit.mjs" }
required = false
options = { verbose = true }

[[middleware]]
id = "budget-policy"
enabled = true
source = { package = "@example/hcc-budget" }
required = true
options = { ceiling = 20 }
```

File paths are relative to the discovered **project root**, not `.arch/` or invocation cwd.

New readers can accept old configuration unchanged. Old readers will reject extended configuration, which is safe forward incompatibility—not a reason by itself to increment the schema. Document the minimum supporting HCC release.

For options, reject date/time values, nonfinite numbers, and values outside the chosen JSON-compatible subset. Make a fresh immutable options snapshot for each factory call.

## 4. R3 — Resolution and distribution

### Project-local files — proposal

- Accept explicit `./` project-relative paths.
- Require a complete `.mjs` path, or `.js` explicitly authored as ESM.
- Reject directories, implicit extensions, URL schemes, and paths escaping the project root.
- Check real-path containment as well as lexical containment; reject symlink escapes.
- Convert the canonical filesystem path with `pathToFileURL()`.
- Do not add query strings or fragments.

These checks define the entrypoint boundary; they do not confine its dependencies or privileges.

### Shared packages — proposal

Accept ordinary package names and exported subpaths. Reject URLs, absolute paths, relative paths, `node:` built-ins, and `#imports` aliases.

Use one explicit, absolute, host-selected installation context. Do not derive it from cwd, PATH, global npm prefixes, or provider request data. Packages are installed there through ordinary external Node tooling; HCC performs no installation.

**Important native-resolution constraint:** Node's `import.meta.resolve()` resolves relative to its own module. Passing an arbitrary parent requires an experimental flag. A practical flag-free design is a tiny, pre-provisioned ESM resolver file physically located in the selected installation context:

```js
// In the explicitly selected shared installation directory.
export const resolvePackage = (specifier) => import.meta.resolve(specifier);
```

The loader imports that known anchor and imports the URL it returns. Do not generate the anchor during execution, use a symlink pointing back into the HCC installation, or silently fall back when it is missing.

This retains native ESM exports/conditions. `createRequire(context).resolve()` is unsuitable as a general ESM resolver because its conditions can select a different export or reject an import-only package.

Native ESM resolution includes ancestor `node_modules` traversal from the anchor. Define that as the standard resolution scope; do not claim it searches only one directory. Use an isolated installation layout and lockfile when tighter reproducibility is needed. [Node 24 ESM documentation](https://nodejs.org/docs/latest-v24.x/api/esm.html#importmetaresolvespecifier)

### Exports, identity, caching — proposal

- Require exactly one documented discovery shape: named `abi` and `createMiddleware` exports. No default/named fallback chain.
- The instance ID must equal the configured ID.
- Reject duplicate configuration IDs before imports, including disabled entries.
- Reject external IDs colliding with built-in or supplied registry keys; never overwrite.
- Permit the same source under distinct configured IDs only when its factory returns those IDs correctly.
- Keep Node's normal URL-based module cache. No cache-busting or hot reload.
- Instances are fresh per dispatch; module-level state and dependencies can be shared across concurrent dispatches. Updates require a new host process. [Node URL caching rules](https://nodejs.org/docs/latest-v24.x/api/esm.html#urls)

## 5. R4 — Minimal public contract

**Verified facts**

The existing middleware and policy interfaces are adequate. A policy-only module currently needs a no-op `register()` because that method is mandatory.

The package is private and has no declared public `exports` map. Type declarations are generated by the build, but the stable installer copies only JavaScript from `dist`. Generated internal declarations therefore do not establish an independently consumable authoring contract.

**Proposal**

Expose one documented package subpath, illustrated as `arch-harness/middleware`. Re-export existing interfaces and their referenced public types; add only the factory/options contract and ABI.

```ts
// Proposed public subpath: arch-harness/middleware
export type {
  ArchMiddleware,
  MiddlewareAPI,
  ExecutionContext,
  Registry,
  PolicyAPI,
  PolicyDecision,
  AgentBeforeSpawn,
};

export type OptionValue =
  | null
  | boolean
  | number
  | string
  | readonly OptionValue[]
  | { readonly [key: string]: OptionValue };

export interface MiddlewareFactoryInput {
  readonly id: string;
  readonly options: Readonly<Record<string, OptionValue>>;
}

export interface MiddlewareModule {
  readonly abi: 1;
  readonly createMiddleware: (input: MiddlewareFactoryInput) => ArchMiddleware;
}
```

An external module exports:

```ts
import type { MiddlewareModule } from 'arch-harness/middleware';

export const abi = 1;

export const createMiddleware: MiddlewareModule['createMiddleware'] = ({ id, options }) => ({
  id,
  register(api) {
    api.on('preflight', () => {
      // Use validated module-specific options.
    });
  },
});
```

Factories remain synchronous. Async work belongs in existing hooks. Validate factory return values at runtime, including ID, callable `register`, and callable optional `registerPolicy`.

The loader's essential shape is:

```ts
loadMiddleware(configuration, baseRegistry, resolutionContext)
  -> Promise<{ registry, configuration, diagnostics }>
```

Here `configuration` retains ordering and excludes only entries skipped during preparation. Diagnostics must also accommodate later factory skips. Keep source URLs and failure metadata in loader diagnostics, rather than adding them to every middleware instance.

Provide declarations through an installable package artifact or documented local package installation. No runtime SDK dependency is needed for authors using type-only imports.

## 6. R5 — Failure semantics

**Verified current behavior**

Process registration failures prevent native launch. Finalize and reverse cleanup are still attempted; ordered failures are aggregated. Non-finalize hook failures propagate; finalize failures are collected.

Policy dispatch returns `policy-error` on configuration, factory, registration, handler, invalid-decision, timeout, or cleanup failure. Failures take precedence over denials. Required policies must be configured, enabled, present in the registry, and register an applicable handler.

The mock adapter permits only `allow`, checks provider capability independently, and removes raw causes from serialized failures.

**Proposed behavior**

| Failure                                                            | Optional external module        | Required external module        |
| ------------------------------------------------------------------ | ------------------------------- | ------------------------------- |
| Malformed configuration, duplicate ID, registry collision          | Stop before imports             | Stop before imports             |
| Missing file/package, invalid source target, resolution failure    | Skip with diagnostic            | Fail closed                     |
| Import/evaluation failure                                          | Skip with diagnostic            | Fail closed                     |
| Invalid export or ABI                                              | Skip with diagnostic            | Fail closed                     |
| Factory throws, returns Promise/invalid instance, or mismatched ID | Skip before registration        | Fail closed                     |
| `register()` / `registerPolicy()` failure                          | Fail dispatch; existing cleanup | Fail dispatch; existing cleanup |
| Hook, handler, decision, or cleanup failure                        | Existing failure semantics      | Existing failure semantics      |

Optionality ends **before registration begins**. Otherwise partially registered hooks would need rollback machinery, expanding the design considerably.

**Required-policy precedence:** trusted `requiredPolicies` always wins over optional loading. A skipped module remains absent from the effective configuration/registry, so existing requirement validation fails. A factory skipped later must also fail when its ID is required; retain the applicable-handler check as a second safeguard. Neither skip may produce `allow`.

Diagnostics should include configured ID, source, resolved URL when available, stage (`resolve`, `import`, `contract`, `factory`), stable code, disposition, and local cause. Do not log options or serialize raw exceptions to providers. Diagnostics must remain separate from policy stdout.

**Concurrency and cleanup**

- Keep prepared registries/configuration invocation-local; never mutate the default or supplied registry.
- Import sequentially in configuration order for predictable failure selection and diagnostics.
- Create instances inside each dispatch; do not cache instances.
- Factories/import evaluation should not acquire resources requiring pipeline cleanup: the cleanup APIs are unavailable before registration.
- Optional import failure does not undo module-level side effects.
- Trusted JavaScript can block synchronously or leave top-level await pending. This design provides no hard import/factory timeout or termination guarantee.

Preserve the existing policy execution budget; document module preparation as a separate, unbounded trusted-code stage unless explicitly authorized to change deadline semantics.

## 7. Lifecycle and resolution

```mermaid
sequenceDiagram
    participant H as Core / policy dispatch
    participant L as Shared loader
    participant R as ESM resolver anchor
    participant N as Node ESM
    participant P as Existing pipeline

    H->>H: Discover/validate configuration and select registry
    H->>L: Prepare enabled external entries
    L->>L: Validate IDs and collisions before imports
    loop Enabled entries in configuration order
        alt Project-local file
            L->>L: Resolve against project root; check containment
        else Shared package
            L->>R: Resolve package from explicit installation context
            R-->>L: Native ESM URL
        end
        L->>N: import(canonical URL)
        N-->>L: Cached or evaluated module namespace
        L->>L: Validate ABI/export; bind factory options
    end
    L-->>H: Registry, effective configuration, diagnostics
    loop Active entries
        H->>H: Create fresh instance; validate or fail/skip
        H->>P: Register instance using existing API
    end
    H->>H: Policy: verify required applicable handlers
    H->>P: Existing phases / policy handlers
    H->>P: Existing finalization and reverse cleanup
```

Disabled modules never reach resolution, import, or construction. Required preparation failure terminates the sequence before native launch or policy permission.

## 8. Compatibility and security boundaries

- Preserve existing Registry, hook order, cleanup order, process supervision, environment restrictions, event contracts, CLI exits, and adapter transport.
- Preserve caller-supplied registry replacement semantics; merge external entries into the selected registry without overwriting it.
- Do not alter stable snapshots, ownership manifests, bootstrap selection, or migration/rebind behavior to install middleware.
- Put shared modules outside the integrity-protected HCC snapshot.
- Modules and configuration selecting them are trusted code inputs with host-process privileges. API restrictions are cooperation mechanisms, not a sandbox.
- Provider enforcement remains adapter-owned. Successfully loading a policy module does not establish native Claude/Codex/Gemini enforcement.
- No package discovery, installation, downloading, dependency graph, service container, or independent runtime is needed.

## 9. Remaining decisions

| Decision                                           | Recommendation                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Where is the shared installation context selected? | One explicit host setting, with an absolute path; never provider input or cwd discovery.                                        |
| How is its resolver anchor provisioned?            | A documented fixed file supplied during explicit installation/setup of that context; no execution-time writes or runtime flags. |
| How are authoring types distributed?               | One public package subpath with shipped declarations; support local package installation before considering publication.        |
| How are successful-dispatch skips reported?        | A separate structured diagnostic channel shared by both entrypoints, with CLI stderr presentation and no policy stdout changes. |

These are narrow contract decisions, not reasons to introduce a plugin framework.

## 10. Smallest implementation plan and regression tests

1. Extend schema 1 validation while preserving legacy entries/defaults.
2. Add the public type facade, ABI/factory contract, and declaration packaging.
3. Add one resolver/import preparation module and one shared pre-registration instantiation helper.
4. Integrate with session registration and policy dispatch; retain their lifecycle ownership.
5. Document trust, cache, options, installation context, and failure boundaries.

Targeted regressions:

- Old configs/defaults unchanged; malformed nearest config still fails closed; unknown fields remain rejected.
- Disabled modules have observable import/factory sentinels that never run.
- Local files work from nested cwd, including Windows paths, spaces, and URL-sensitive characters; traversal/symlink escape fails.
- Shared package selection is independent of cwd/global installations; import-only and conditional exports select the intended ESM entry.
- Missing modules, import rejection, ABI/export errors, factory errors, and ID mismatches cover required/optional behavior.
- Duplicates/collisions fail before any import side effect.
- Optional skips cannot satisfy required policies, including disabled/missing/no-handler cases.
- Partial registration failures retain cleanup and primary/secondary failure precedence.
- Concurrent dispatches share module evaluation but receive distinct instances/options.
- Existing registry-selection timing, CLI exits, policy serialization, and native launch contracts remain unchanged.

**Validation actually performed during research**

- **PASS:** remote-main verification, identical-tree verification, source/contract/test inspection, and Node 24 documentation review.
- **PASS:** final working-tree status still showed only the pre-existing deletion.
- **NOT TESTED:** implementation, runtime experiments, builds, tests, lint, coverage, and CI; this was read-only research.
- **Limitation:** the resolver-anchor recommendation is documentation-backed and requires the proposed real-package regression before implementation acceptance.

**Implementation verdict: CONDITIONAL GO**, subject to fixing the explicit package-resolution context/anchor contract and ensuring required-policy precedence over every optional skip.
