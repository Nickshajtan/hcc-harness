# Code style and human readability

Policy levels and exceptions are defined in the [entrypoint](README.md).

## Formatting policy

Prettier is the formatter for TypeScript, JavaScript, JSON, Markdown and YAML.
Run `npm run format` to write changes and `npm run format:check` to verify them.
Pinned version and scripts are in package.json; `.prettierrc.json` defines two
spaces, single quotes in JS/TS, semicolons, trailing commas, 100 columns, LF and
preserved Markdown prose wrapping. Unsupported formats (C/C++, PowerShell, shell,
TOML) remain manually reviewed. Do not reformat unrelated code in feature PRs.
`.prettierignore` documents generated, vendored and frozen-file exclusions.
CI enforces check mode on all three supported operating systems. `.gitattributes`
keeps formatter-covered checkout files LF even under Windows core.autocrlf; the
frozen M1 source preserves its exact historical CRLF blob.
Frozen legacy generators, generated launcher bytes, vendored code and golden
fixtures MUST NOT change accidentally during formatting; explicit ignores need
provenance and a byte-compatibility rationale, not convenience.

## Comparisons and control flow

Code SHOULD put literals on the left of equality comparisons:

```ts
if ('run' === operation) {
  return executeRequest(request);
}
```

This is a project convention, not significant additional type safety in modern
TypeScript. ESLint enforcement is `yoda: ['error', 'always',
{ exceptRange: true }]`: allow readable ordered range checks such as
`minimum <= value && value <= maximum`. Comparisons without a literal have no
artificial operand-order requirement. Fixture compatibility can justify a narrow
exception. The baseline mechanical pass adopted this convention without changing comparison semantics.

Code SHOULD use guard clauses, early returns, descriptive intermediate variables,
named operations, explicit errors and small cohesive functions. Use braces around
control-flow bodies and strict equality. Avoid nested ternaries, dense one-line
branches and hidden mutation inside predicates or getters.

```ts
if (!ownershipMatches) {
  throw new Error('Managed file changed; refusing removal');
}

await removeOwnedFile(path);
```

Ordinary conditionals are appropriate. Long variant chains or workflow-sized
switches SHOULD prompt a responsibility review, not automatic pattern extraction.
Prefer a meaningful options object or named operation over an unexplained boolean
such as `removeFiles(root, true)`. Do not divide a cohesive operation solely to meet
a line limit; [complexity policies](quality-gates.md) are review triggers.

## Names and types

Names SHOULD express domain intent: `retainedFiles`, `routingPlan`,
`ownershipRecord`, `runtimeSelection`, `executionResult`, `recoveryState`.
Avoid generic `data`, `manager` or `handle` when a precise responsibility is known.
Short local indices are acceptable when their meaning is obvious.

Use explicit types where they make meaningful invariants visible: route names,
managed files, ownership records, runtime selection, routing plans, execution
results and recovery states. Validate external values at boundaries before treating
them as domain values. Prefer a discriminated union when different states carry
different data. Do not brand every string, wrap trivial primitives in classes or
create a parallel public schema merely to satisfy a style preference.

## Comments

Comments SHOULD explain non-obvious reasons, invariants, compatibility constraints,
security/recovery assumptions or surprising platform behavior. For example,
explain why publication needs no-replace semantics or why Windows shim Node
selection cannot use Arch's runtime. Do not repeat the next line in prose.
Prefer expressive names and cohesive functions to comments narrating dense code.
Keep comments accurate when changing the associated behavior.
