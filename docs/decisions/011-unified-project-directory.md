# ADR-011: One selected HCC project directory and ownership boundary

## Status

Implemented for project layout consolidation; acceptance depends on executed PR gates.

## Context

PR #29 located configuration and the resolver in five supported homes while routing,
claims and journals remained in `.arch`. Alternative configuration could therefore
create a hidden second installation. Relocating strings without constraining manifests
would broaden cleanup authority and make interrupted state ambiguous.

## Decision

Resolve one immutable project layout at the management boundary and pass it to
rendering and lifecycle components. Supported homes remain `.hcc`, `.hcc-harness`,
`.arch`, `.ai/.harness`, `.ai/arch`. Runtime discovery selects the nearest single
configuration with no merging, invalid-file fallback or crossing an explicit boundary.
Init defaults to `.arch`; `--config-dir` accepts exactly the same five names.
CLI/wizard entrypoints discover the nearest root; explicit-root programmatic services
retain their exact target-root contract. Both use the same single-root evidence inspection.

Launchers, bootstrap/uninstall manifests, route journals, setup claims and stages live
in the selected home alongside configuration, project-local modules and `.internal`.
The external mise file stays `.config/mise/conf.d/arch.toml` and references that home's
bin directory. Stable and development entrypoint rendering retains existing contracts.
The exact router marker continues to identify managed PATH entries independent of names.

Ownership is unchanged: recorded hashes authorize only recorded safe paths. Parsing
accepts only the selected launcher directory plus the existing mise path. The manifest
format remains unversioned. Legacy `.arch` records remain readable and authoritative.
Generated configuration is removable only under existing createdHarness/byte rules;
user modules, edited/preexisting configuration, the resolver helper and unknown residue
are retained. No recursive removal of homes or `.ai` parents is introduced.

Management discovery also recognizes lifecycle evidence without configuration. Multiple
homes with evidence are rejected, including old split installations; no migration or
cross-home cleanup is attempted. Invalid configuration does not prevent independent
ownership inspection or cleanup, but runtime execution still fails closed. Setup claims
are not automatically adopted. Publication ordering, recovery checkpoints and original
failure precedence remain intact. One mutator per project remains the supported limit;
no adversarial filesystem-race or power-loss durability claim is added.

## Consequences

A new `.ai/arch` installation needs no `.arch` directory. Management from subdirectories
uses the same nearest home. A missing configuration does not hide recovery evidence.
An existing split installation requires manual provenance review before any mutation;
V1 intentionally provides no migration command. Unmarked user directories never gain
ownership or recursion significance merely because they use a supported name.

## Considered alternatives

Blind replacement could redirect legacy ownership. Accepting all aliases in every
manifest could delete another home's files. Automatic migration would require an
additional transaction and provenance contract. A global root or service container
would obscure per-operation selection. Explicit immutable path values preserve the
existing lifecycle with the smallest necessary path change.

## Evidence and implementation references

[Layout](../../src/project-layout.ts), [lifecycle](../../src/lifecycle/index.ts),
[unit matrix](../../tests/unit/project-layout.test.ts),
[native matrix](../../tests/integration/project-layout.test.ts),
[stable integration](../../tests/integration/stable-runtime.test.ts).
Executed platform, recovery and quality outcomes belong to the PR evidence.

## Date and revision

2026-11-17; supersedes the routing-location limitation in ADR-010 without changing ABI v1.
