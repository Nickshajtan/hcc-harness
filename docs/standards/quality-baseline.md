Р С—Р’В»РЎвЂ”# Quality baseline and refactoring backlog

This is the maintained starting point for Structural Refactoring, not authority to
perform it or M2.2 B2. Baseline main: `769b528ea87ddc3992a872c4fefab8646a487682`
(after PR #8). Measurements below are Windows x64, Node 24.19.0, unless identified
as hosted evidence. Re-run commands after meaningful changes; counts are not budgets
that permit adding debt. Human comprehensibility remains the review criterion.

## Reproduction and tools

| Tool                         | Pinned version   | Command / output                                                      |
| ---------------------------- | ---------------- | --------------------------------------------------------------------- |
| Prettier                     | 3.9.10           | `npm run format:check`; `.prettierrc.json`                            |
| ESLint / typescript-eslint   | 10.12.0 / 8.71.2 | `npm run lint`; `npm run lint:report` produces `reports/lint.json`    |
| eslint-config-prettier       | 10.1.8           | Removes layout conflicts, followed by semantic comparison/brace rules |
| TypeScript                   | 6.0.3            | `npm run typecheck`                                                   |
| Vitest / coverage-v8         | 5.0.5 / 5.0.5    | `npm run test:coverage`; JSON, HTML, LCOV in `coverage/`              |
| Stryker core / Vitest runner | 10.1.1 / 10.1.1  | `npm run test:mutation`; JSON/HTML in `reports/mutation/`             |
| dependency-cruiser           | 18.7.0           | `npm run check:dependencies`, `npm run report:dependencies`           |
| Knip (evaluation only)       | 6.43.0           | `npm exec --yes --package=knip@6.43.0 --call "knip --reporter json"`  |

All new installed tools are development dependencies. No runtime dependencies or
public contracts changed. npm audit reports two moderate advisories through
Stryker's dev-only `typed-rest-client -> qs@6.15.1`; a compatible `npm update qs`
did not resolve them. No forced override/audit fix was applied. Review upstream
updates before broadening mutation use; do not expose a report server to untrusted
inputs. This is a recorded dependency limitation, not a clean-audit claim.

## Formatting and lint baseline

Formatting used a dedicated commit and protected frozen M1 renderer/vendor bytes.
String/template values in 20 src/script/fixture files were compared before/after
formatting; unchanged. Prettier required a second pass on one multiline return-type
signature in tests/support.ts; that isolated whitespace correction is recorded.
No executable shebang, launcher payload or serialized manifest format was changed.
Unsupported C/C++, PowerShell, shell and TOML are manually reviewed, not silently
claimed as formatter/linter coverage.

Initial strict probe (before remediation) found 150 Yoda and 170 brace findings.
Mechanical literal reordering/braces and type-only import cleanup were applied;
production semantic edits are limited to explicit `unknown` annotations for the
CLI catch callback and AbortSignal.reason. No workflows or functions were split.
Final ordinary lint: **0 errors, 141 visible legacy warnings**. Analysis mode adds
51 metric findings: **192 warnings across 44 linted files**, with no hidden source
or eslint-disable blocks. Configuration is authoritative for exact per-rule severity.

| Diagnostic category                                          | Remaining findings |
| ------------------------------------------------------------ | -----------------: |
| Non-null assertions                                          |                 44 |
| Unnecessary conditions                                       |                 13 |
| Unsafe test JSON assignments/member access/returns/arguments |    11 / 27 / 6 / 8 |
| Template/plus operand restrictions                           |              8 / 6 |
| Optional/nullish-chain preferences                           |              1 / 4 |
| Unnecessary conversion / dynamic delete                      |              2 / 1 |
| Empty test callbacks / async without await                   |              4 / 2 |
| Nested ternaries (including script)                          |                  3 |
| Complexity >12 / depth >3 / params >4 / function length >60  |   11 / 19 / 3 / 18 |

Unsafe calls, floating/misused promises, explicit any, production unsafe boundaries,
production unnecessary assertions, exhaustive switches, type imports, strict equality,
braces and Yoda comparisons block CI. Existing warning categories need focused
characterization and remediation before promotion; no baseline-aware new-warning
ratchet is available. Review must reject new violations. Strict boolean-expression
policy remains deferred while intentional truthiness conventions are examined.

## Complexity, cohesion and coverage

ESLint uses its default modified complexity calculation; line counts below are
physical module lines, not a defect ranking. Function length counts nonblank,
noncomment lines; braces increase that metric without changing behavior.
Coverage includes every executable production file, excludes only declarations,
and does not credit built child-process execution to Vitest's in-process collector.

**Coverage: lines 73.57% (607/825), branches 65.70% (387/589), statements 73.87%,
functions 82.40%.** These are measured results, not the 95%/90% critical targets.
No numeric threshold is enabled. CLI/commands/demo remain included at 0%; real CLI
acceptance/terminal tests exist, but their subprocess execution is not aggregated.

| Module        | Lines | Hotspots / responsibilities                                                                                                                                                     |              Line / branch coverage |
| ------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------: |
| lifecycle.ts  |   498 | journalFrom complexity 20; validateRecovery 13; applyJournal 14; inspection 26 / 107 function lines. Parsing/planning, ownership, publication, recovery and diagnostics coexist |                      92.08 / 84.39% |
| setup.ts      |   246 | setup complexity 15 / 72 function lines; uninstall 14. Rendering, manifest validation, initialization rollback, symlink safety and uninstall journal                            |                      90.51 / 89.28% |
| process.ts    |   219 | resolution 16; launch 15 / 132 function lines / 5 parameters; depth 5. PATH/npm shim policy, spawning, cancellation and settlement                                              |                      66.11 / 59.77% |
| commands.ts   |   114 | dispatch complexity 37 / 92 function lines; depth 4. Parsing, handlers, status presentation and interactive lifecycle                                                           | 0 / 0% (subprocess measurement gap) |
| core.ts       |   127 | execute complexity 23 / 108 function lines; depth 4. Registry composition, phases, failure precedence and finalization                                                          |                      87.50 / 70.00% |
| events.ts     |    80 | No metric trigger. Generic payload assertions, observer/report isolation and default diagnostics                                                                                |    93.33 / 0% (one measured branch) |
| middleware.ts |   114 | createPipeline 89 function lines, no complexity trigger. Registration state, phase rules, env protection and cleanup                                                            |                      97.61 / 91.66% |
| wizard.ts     |   135 | setupWizard complexity 27 / 85 function lines. Terminal presentation, selection and lifecycle                                                                                   |                      70.83 / 72.54% |

Other measured coverage: config 100/100%, discovery 90.90/90.90%, cli 0/0%, demo 0/0%.
Mixed modules must not average away critical contracts. Known follow-up scenarios:

- Lifecycle: malformed journal/payload combinations, unexpected safe-path/status errors,
  unreferenced staging and cleanup failures. Retain real interruption checkpoints;
  numeric gaps alone do not mean those existing tests are absent.
- Setup: rollback cleanup failure precedence, initialization/uninstall conflict paths,
  symlink/read failures, unsupported architecture. Preserve renderer bytes and hashes.
- Process: platform-specific npm shim/adjacent Node/router branches, kill failures,
  already-settled cancellation and escalation. Existing Windows subprocess tests do
  not all contribute to this in-process percentage. Measure per-platform before policy.
- Core: mismatched registry IDs, resolution/finalize-only failures and combined
  primary/secondary errors need explicit characterization before simplifying nesting.
- Events: default reporter failure output and generic event/payload correlation.
  Observer errors intentionally cannot authorize or reverse execution.
- Middleware: ended/invalid registration and conflicts across lifecycle phases;
  preserve finalizer continuation and LIFO cleanup. Unit tests already protect the
  main lifecycle; expand mutation beyond config only after isolation is established.
- CLI/wizard: quantify subprocess coverage separately without dropping real TTY tests.
  No artificial private-helper tests solely to raise coverage.

## Mutation pilot and survivor review

Pilot scope: all of src/config.ts, five real tests in tests/unit/config.test.ts.
No mutator, branch or production-file exclusions within that scope. Other production
modules are outside this initial pilot, not marked mutation-compliant. The sandbox
contains only required source, tests and configuration; this avoids copying local
runtime installations and keeps reproduction small.

Initial run: **93 mutants; 64 killed, 23 survived, 1 no coverage, 5 timeout, 0 errors**;
34 seconds. Stryker score 74.19%; assertion-only kills 68.82%. Survivors exposed
missing invalid identity/type/diagnostic and error-cause assertions. Three new
behavior tests now cover immutable validated results, exact rejection diagnostics,
contextual cause preservation and real non-ENOENT read failures. No production fix
was needed. Final reviewed run: **93 mutants; 87 killed, 1 survived, 0 no coverage, 5 timeout,
0 errors; 15 seconds**. Stryker score **98.92%**; assertion-only kills **93.55%**
(87/93). The remaining mutant (ID 37, prefix guard removal) is equivalent for valid
TOML values: later string/regex/enabled validation still rejects non-table, array
and missing-ID values; TOML cannot represent a null/undefined entry. It remains
reported, not excluded. Boolean and array IDs were added explicitly because regex
coercion alone could accept them if the string-type guard were removed.

Five timeout mutants remove directory-walk progress, termination or parse return;
they create loops and are **not semantic assertion successes**. Remaining survivors
must be interpreted against valid TOML inputs and redundant guards, not automatically
excluded. No equivalent-mutant ignore comments were added. The pilot target remains
nonblocking; ownership/recovery/cancellation mutation is NOT TESTED in this scope.

A sandboxed Windows run generated reports but failed process-tree cleanup (taskkill
access denied). Unsandboxed runs pass. Early runs copied local .tools contents and
logged symlink warnings; limiting sandbox inputs resolved that avoidable work.
Generated sandbox tests are excluded from ordinary Vitest discovery. CI uses real
workers and must fail on unexplained runtime/tooling errors.

## Dependency health and dead-code evaluation

Dependency-cruiser: **25 modules / 44 dependencies**, including external boundaries
and type edges; 13 local src modules including declarations. **No cycles or selected
boundary violations**. Core imports config, demo, events, middleware and process;
lifecycle imports config, process and setup; wizard imports discovery, lifecycle and
setup. Shared setup/process dependencies are coupling points, not cycles. Generic
modules contain infrastructure today; no claim of pure domain layering is made.
Two rules are enforced: no cycles; no CLI/commands/wizard imports in config/core/
events/middleware. No provider adapters exist. More rules require responsibility work.

An npx-only dependency-cruiser evaluation could not resolve its TypeScript parser
and cruised zero modules; that result was rejected, not reported as a clean graph.
A local pinned install resolves TypeScript and supplies useful, small enforcement.
Knip completed in seconds after provisioning (approximate, not a timed baseline); its default evaluation
reported 4 file candidates, 8 exports and 2 unlisted dependency uses. Inspected:

- mutation config, native.cjs and routing-worker.mjs are explicit config/runtime reads;
- check-tty.mjs is retained B1 feasibility evidence, not disposable merely because
  current CI uses the newer shared checker;
- bin-links is deliberately resolved from npm's own installation to test real shims;
- defaultRegistry, configText, cliCatalogue and routingPath are internally used;
  unused _export_ does not make the declaration dead;
- stop() in test support, lifecycle's setup re-export and frozen fixture uninstall
  are candidates for later API/reference review, not deletions authorized here.

Knip is not retained as a dependency/gate: entrypoint configuration and false-positive
maintenance outweigh present benefit. No detected file/export was deleted.

## Enforcement, cost and next work

Local baseline check: 131 passed / 30 existing optional/platform skips, 36 seconds.
After targeted tests: 134 passed / 30 skips, 42 seconds. Wizard: 14 unit tests and
13 real-terminal scenarios pass. Coverage reruns the ordinary suite (~40 seconds);
lint analysis ~7 seconds; dependency check ~1 second. Pilot runtime is measured
separately above. Provisioning dominates cold runs; hosted job durations are recorded after inspection below. New PR coverage/report job is Ubuntu-only;
existing three-platform regression, wizard and mandatory runtime matrix remain.
The 15-second pilot runs on configuration/tooling-related PRs and weekly/manual;
there is no repository-wide or unconditional per-PR mutation suite.

Preserve strict/admin-enforced main protection and exact required runtime status
name. Format, safe typed lint and two dependency rules now fail existing CI jobs.
Coverage/mutation percentages remain review targets. No warning suppression ratchet,
full mutation or Windows ARM64 evidence is implied. Remaining documentation debt:
docs/testing.md mixes ordinary and B1 reproduction; reassess historical test/script
organization after B2, retaining active prototypes and evidence.

Refactoring order (separately authorized):

1. Characterize Core failure precedence, middleware lifecycle and process cancellation;
   expand focused mutation with controllable dependencies, preserving real I/O tests.
2. Clarify lifecycle/setup ownership, journal parsing, planning and recovery decisions
   with checkpoint tests before separating effects; highest correctness risk.
3. Isolate process resolution/Windows npm policy from child settlement only after
   native-runtime and console contracts pass; coordinate with B2 approval boundaries.
4. Simplify command/wizard presentation and dispatch after CLI measurement improves.
5. Tighten event correlation and test JSON boundaries, then promote warning rules by
   category. Review unused exports and document navigation after contract review.

No architectural module split, new layer, public API/manifest change, native process
semantic change or B2 integration is part of this milestone.

### CI setup correction

The first new coverage job failed two existing mise tests with `spawn mise ENOENT`:
setup-node alone did not satisfy suite prerequisites. It was corrected to use the
same pinned mise action as ordinary regression CI. Assertions were not weakened
or skipped. An automatic implicit-void wizard callback rewrite was also reverted;
its original return behavior is preserved and the readability warning remains.
