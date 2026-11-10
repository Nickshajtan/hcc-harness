# Provider policy vertical slice 1: validation

Executed locally on Windows, Node 24.19.0, 2026-11-10. Recommendation:
**CONDITIONAL GO** for review of this mock vertical slice, pending hosted checks
and maintainer review. This is not approval of a real provider adapter.

## Checks actually executed

| Check                                                                    | Result     | Evidence                                                                                         |
| ------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                                      | PASS       | Strict TypeScript, existing settings                                                             |
| `npm run lint`                                                           | PASS       | Zero errors                                                                                      |
| `npm run lint:baseline`                                                  | PASS       | Zero known/new warnings                                                                          |
| `npm run format:check`                                                   | PASS       | All matched files formatted                                                                      |
| `npm run check:dependencies`                                             | PASS       | 67 modules, zero violations                                                                      |
| `npm run build`                                                          | PASS       | Includes dedicated mock executable                                                               |
| `npm run test:quality`                                                   | PASS       | 24 tooling tests, zero skips                                                                     |
| Focused regression command below                                         | PASS       | 103 tests in 7 files, zero skips                                                                 |
| `npx vitest run --config vitest.policy.config.ts --coverage`             | PASS       | 47 tests; both new implementation modules 100% lines / 100% branches                             |
| Scoped existing middleware/Core/EventBus coverage command below          | PASS       | 49 tests; all existing scoped gates met                                                          |
| `npm run test:mutation:core` then `node scripts/check-mutation.mjs core` | PASS       | 224 killed, 8 survived, 2 no coverage; zero timeouts/errors; every existing per-file gate passes |
| `npx stryker run stryker.policy.config.json`                             | PASS       | 289 killed / 295 total, 6 survived, zero no-coverage/timeouts/errors                             |
| `git diff --check`                                                       | PASS       | No whitespace errors                                                                             |
| Hosted CI, POSIX execution, real provider hooks                          | NOT TESTED | No hosted results claimed; no full cross-platform acceptance matrix run                          |

Focused regression:

```sh
npx vitest run tests/unit/core.test.ts tests/unit/execution-policy.test.ts tests/unit/environment.test.ts tests/unit/events.test.ts tests/unit/policy.test.ts tests/unit/mock-provider.test.ts tests/integration/mock-provider.test.ts --exclude '**/.test-state/**' --reporter=default --reporter=json --outputFile=reports/policy-tests.json
```

Scoped existing coverage (retains the repository's configured thresholds):

```sh
npx vitest run tests/unit/core.test.ts tests/unit/execution-policy.test.ts tests/unit/environment.test.ts tests/unit/events.test.ts --exclude '**/.test-state/**' --coverage --coverage.include=src/middleware.ts --coverage.include=src/events.ts --coverage.include=src/core/**/*.ts --coverage.reportsDirectory=coverage/policy-regression
```

Existing middleware achieved 100% lines / 95.83% branches; EventBus achieved
100% / 100%; execution-session achieved 98.21% / 91.66%; remaining Core files
achieved 100% / 100%. The uncovered session path is infrastructure failure from
`pipeline.run('finalize')`; the provider slice does not change it. The unvisited
middleware branch is the POSIX environment-key path when executed on Windows.

The `.test-state` exclusion applies only to generated local baseline/candidate
snapshots, not maintained production or tests. Earlier runs included those copied
suites and reported inflated totals (180/193); the authoritative final root suite
above contains 103 tests. The dedicated policy and Core mutation configurations
already use anchored test includes and did not include copied suites.

## Mutation review

StrykerJS 10.1.1, Vitest runner, two workers; complete `src/policy.ts` and
`src/mock-provider.ts`, no mutation exclusions. Final policy pilot took 66 seconds:
policy 194/196 assertion kills (98.98%); mock adapter 95/99 (95.96%). Both exceed
the 85% critical target without timeout credit. Report sources were checked against
current production files using `verifyMutationSources`; `mutationEvidence` rejected
errors/exclusions, and both assertion scores were explicitly checked against 85%.
This is a focused measurement, not a newly claimed hosted policy mutation gate.

All six survivors were reviewed:

- Policy's initial empty `currentId`: overwritten before any configured factory or
  registration failure can occur; unused for empty/disabled configurations.
- Policy's `handlers` state string changed to empty: both values close registration,
  allow cleanup registration, and classify failures as handler failures. The explicit
  named state remains clearer production code.
- Mock oversize and invalid-JSON exception messages changed to empty (two mutants):
  messages are intentionally internal; adapter responses expose only outcome codes.
- Mock JSON catch body removed: the resulting undefined request still returns the
  same invalid-request response/status without invoking policies.
- Mock internal JSON exception cause removed: causes at this transport boundary are
  intentionally absent from the wire contract. Policy failure causes remain retained
  by the engine and tested separately.

Existing Core pilot took 96 seconds; middleware 92/96 assertion kills (95.83%),
EventBus 15/15, other files meet their unchanged 85% gates. Its surviving/no-coverage
mutants are in unchanged runtime implementation: platform-equivalent Windows casing,
redundant fail-closed checks/secondary diagnostics, disposed-hook and phase-reset
observability, no-configuration behavior, and defensive finalization failure paths.
They are existing coverage limitations, not evidence of new provider dispatch behavior.
No production Core, EventBus or process-pipeline implementation was rewritten.

The first sandboxed mutation attempt **FAILED** because Windows denied Stryker's
`taskkill` worker cleanup. An approved unsandboxed run completed but exposed test
gaps and one mutation-runner error while mutating stream error-listener removal.
Additional behavioral tests cover exact byte limits, inherited fields, late cleanup,
specific validation diagnostics, and listener ownership. The final run above has
zero runner errors; the original failed attempts are not counted as passes.
Stryker also emitted nonfatal existing-style `files` deprecation and Windows symlink
warnings; the dry runs and complete final instrumented runs succeeded.

## Compatibility and limitations

The only edit to existing production middleware is a type-only import and optional
`registerPolicy` interface member. Existing process implementations/tests, public
CLI, default registry, generated harness configuration/schema, environment restrictions,
cleanup ordering, process supervision and runtime/ownership contracts remain unchanged.
New behavior lives in the policy contract/dispatcher and the local mock transport/CLI.
No agent launcher, orchestration, provider SDK, network service or paid inference exists
in this slice. Real provider enforcement remains unvalidated. Trusted middleware must
settle its promises; arbitrary JavaScript execution is not time-limited or sandboxed.
The mock's input limit bounds bytes, and EOF bounds framing; callers must close stdin.
Adapters must block on every non-allow outcome and failed/missing transport response.
