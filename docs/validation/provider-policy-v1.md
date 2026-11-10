# Provider policy vertical slice 1: validation

## H1–H3 hardening (current contract)

Reviewed head: `93710fc887de4ed09f54d525d0411c8320c63fae`. None of H1–H3 was
resolved at that head. The record below describes the focused hardening on the same
PR branch. Recommendation: **CONDITIONAL GO** for the documented cooperative,
in-process contract, pending hosted review/checks. No tested async-registration,
required-policy or timeout path authorizes a request. Arbitrary JavaScript execution
is not isolated, and POSIX execution remains NOT TESTED locally.

Public changes are the fourth optional `PolicyDispatchOptions` argument
(`requiredPolicies`, `timeoutMs`, `cleanupGraceMs`), additive optional `PolicyAPI.signal`,
failure `code` and configuration stage, `MockHookOptions.policyOptions`, and mock
exit statuses 6 (primary timeout) / 7 (primary configuration failure). Existing
allow/deny, invalid input, ordinary policy error, unsupported and transport outcomes
retain their semantics and statuses. The executable pins its own required demo
policy and 5000 ms + 100 ms deadline/grace; provider fields cannot select either.

- H1: non-undefined registration returns are contract errors. Genuine Promises are
  observed without awaiting registration or invoking arbitrary thenables. Per-module
  windows close in finally; partially registered cleanup runs once; no handler starts
  after failed registration. Tests cover suspension, rejected/fulfilled Promises,
  hostile then properties, non-Promise returns, synchronous exceptions and late calls.
- H2: requirements are validated/copied from trusted options, then checked against
  enabled configuration, registry, instance identity, successful registration and
  handler ownership. All presence checks precede handler execution. Tests include
  multiple policies, an unrelated handler, disabled/missing/process-only modules,
  duplicates, malformed options, forged request fields and concurrent requirement sets.
- H3: one monotonic deadline and dispatch-scoped cancellation cover registration,
  handlers and cleanup, followed by one shared cleanup grace. Every async wait has
  rejection continuations; late results cannot mutate frozen failure metadata or the
  final decision. Tests use fake timers/barriers for hanging/late/cooperative work,
  denial followed by timeout, cleanup rejection/hang, exact limits and independent
  cancellation. Direct deadline tests exercise cancellation during pending cleanup
  and delayed timer delivery. No process ExecutionSession uses this mechanism.

Executed on Windows, Node 24.19.0, 2026-11-10:

| Check                                                              | Result     | Executed evidence                                                                                                           |
| ------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                | PASS       | Existing strict TypeScript settings                                                                                         |
| `npm run lint` / `npm run lint:baseline`                           | PASS       | Zero errors/new warnings                                                                                                    |
| `npm run build`                                                    | PASS       | Engine, mock executable and helper compile                                                                                  |
| `npm run check:dependencies`                                       | PASS       | 69 modules; zero violations                                                                                                 |
| `npm run test:quality`                                             | PASS       | 24 tooling tests; zero skips                                                                                                |
| Focused regression command below                                   | PASS       | 189 tests / 9 files; zero skips, including 49 unchanged process regressions and 10 real subprocess mock cases               |
| `npx vitest run --config vitest.policy.config.ts --coverage`       | PASS       | 130 tests; all three changed implementation modules 100% lines / 100% branches; unchanged 95%/90% per-file gates            |
| Existing scoped Core/middleware/EventBus coverage command below    | PASS       | 49 tests; all existing gates met; middleware 100%/95.83%, session 98.21%/91.66%, other scopes 100%/100%                     |
| `npx stryker run stryker.policy.config.json`                       | PASS       | 513 assertion kills / 542 mutants (94.65%); 29 survived; zero no-coverage/timeouts/errors                                   |
| Production source matching + per-file assertion score verification | PASS       | All report sources match current files; every changed file exceeds 85% assertion kills                                      |
| `npm run format:check` / `git diff --check`                        | PASS       | Formatted changed files; no whitespace defects                                                                              |
| POSIX execution                                                    | NOT TESTED | Ubuntu/WSL is present; `wsl -d Ubuntu -- sh -lc "node --version"` reports `node: not found`. No new runtime was provisioned |
| Hosted CI / real providers / full acceptance matrix                | NOT TESTED | No hosted results claimed; no paid inference or provider launches                                                           |

```sh
npx vitest run tests/unit/policy.test.ts tests/unit/policy-hardening.test.ts tests/unit/policy-deadline.test.ts tests/unit/mock-provider.test.ts tests/unit/core.test.ts tests/unit/execution-policy.test.ts tests/unit/environment.test.ts tests/unit/events.test.ts tests/integration/mock-provider.test.ts --exclude '**/.test-state/**' --reporter=default --reporter=json --outputFile=reports/policy-hardening-tests.json
```

The existing scoped coverage command appears in the historical record below and
was rerun unchanged. Maintained code/tests were not excluded; `.test-state` contains
only generated local snapshots. Production Core, middleware and EventBus runtime
implementations were not modified by H1–H3. No deadline or signal was added to
process phases, and process environment/cleanup ordering remains unchanged.

### Hardening mutation review

StrykerJS 10.1.1 / Vitest runner, two workers, complete policy, deadline and adapter
sources, no exclusions. Final measured duration 152 seconds. Per-file assertion
kills: policy 357/373 (95.71%); deadline 51/58 (87.93%); adapter 105/111 (94.59%).
The measured snapshot ran 129 focused tests; the final 130-test coverage/regression
set additionally checks an immediately fulfilled invalid registration Promise.
Production sources did not change between these runs. Source and error-status
validation uses the existing `verifyMutationSources` / `mutationEvidence` helpers;
scores were explicitly checked against 85%, without timeout credit.

All 29 survivors were reviewed by exact mutation location (IDs are local to this
report; they are not exclusions):

| Scope / mutant IDs                            | Review                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Policy 141                                    | Removing the string type subguard still rejects tested nonstring requirements through regex validation; requirements matching well-typed configured string IDs remain unchanged. Explicit type validation is retained to avoid coercing malformed trusted options. |
| Policy 165                                    | Forcing native-Promise observation on a non-Promise throws a caught TypeError instead of the deliberate contract Error. Both remain registration-contract failures with the correct stage/ID; no thenable method executes and no allow occurs.                     |
| Policy 169, 206, 212, 284, 305, 317, 348, 374 | Local exception message changes; structured failure code/stage/ID, denial retention and refusal remain asserted. Messages are not serialized or used as authorization.                                                                                             |
| Policy 246                                    | Global registration-stage check is redundant with the separately tested per-module registration window.                                                                                                                                                            |
| Policy 307                                    | An empty handler-phase label still selects the non-cleanup deadline branch; no grace extension occurs. The explicit label remains clearer code.                                                                                                                    |
| Policy 310, 311, 313                          | Returned timeout settlements also have an expired deadline/aborted signal, so these overlapping timeout predicates preserve refusal.                                                                                                                               |
| Policy 354                                    | With no allocated deadline the cleanup list is empty, so unconditionally entering its loop does not dereference an absent deadline.                                                                                                                                |
| Deadline 535, 536, 537                        | The native result Promise settles once; subsequent resolve attempts and AbortController.abort calls are idempotent. The explicit settlement guard avoids unnecessary late work and is retained.                                                                    |
| Deadline 542, 544, 557, 558                   | Timer callbacks run at/after the absolute wait end; the elapsed-time guard still produces timeout when the timeout tag is removed/changed. These mutations do not remove timer delivery itself.                                                                    |
| Adapter 410, 413, 415, 416                    | Internal input exception messages/causes and undefined malformed JSON all preserve invalid-request status with no policy invocation.                                                                                                                               |
| Adapter 501, 507                              | Optional chaining removal is equivalent: every policy-error result from this engine contains a primary failure.                                                                                                                                                    |

The first hardening measurement exposed missing tests (including an unrelated
handler satisfying a required policy and signal delivery while cleanup is pending):
deadline assertion kills were 74.14%. Added behavioral regressions raised it to the
final 87.93%; no threshold, source inclusion, timer budget or assertion-only rule
was relaxed. Nonfatal Stryker `files` deprecation and Windows symlink warnings
remain visible; both completed hardening mutation runs had zero runner errors.

A loaded subprocess regression run **FAILED** an overly specific test expectation:
it received a primary timeout plus a valid secondary cleanup timeout after the
shared grace had elapsed, rather than exactly one diagnostic. The test now checks
the exact primary code/ID, valid registration/handler attribution, exit 6 and
`permitted: false`, and allows only the precisely shaped secondary cleanup timeout.
No real/fake deadline was raised, no failed operation retried into a pass, and no
non-allow assertion was weakened. The final 189-test run passed without retries.

### Guarantees and remaining limits

The contract bounds waits only while the event loop is responsive. It cannot
preempt CPU-bound JavaScript, an infinite microtask loop or blocking native code.
After the shared cleanup grace, callbacks are attempted once with an aborted
signal but no further await budget; their noncooperative operations may outlive
the request or retain active Node handles. The engine does not claim resource
termination or hard process-exit latency. Input EOF and output transport latency
are outside the policy budget. These are explicit in-process limitations, not
authorization bypasses: every timed-out/missing/failed tested policy is refused.
No workers, isolation service, launcher, orchestration or real provider adapter
was introduced. Real Claude/Codex/Gemini enforcement remains unvalidated.

## Historical VS1 baseline (93710fc)

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
