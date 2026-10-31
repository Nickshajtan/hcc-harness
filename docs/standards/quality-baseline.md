# Quality baseline and remaining debt

Baseline: `36df37c8bb2811edb4b4faa9eb9634e3f0550bd6`, main after PR #13.
Implementation and current-head validation status: [PR #14](https://github.com/Nickshajtan/hcc-harness/pull/14).
Measurements below are executed Windows x64 / Node 24.19.0 observations, not
cross-platform substitutes. Human comprehension, ownership and preserved behavior
take priority over metrics. B1 remains feasibility; B2 is not implemented.

## Stability investigation: UNRESOLVED

**NOT READY FOR B2.** One earlier local run returned uninstall code 1 immediately
after a native fixture completed. Its original stderr and fixture were not retained.
No root cause can be established from that evidence. A successful rerun, previous
30 repetitions and current green tests do not resolve the incident.

A final local coverage run also returned code 1 in the existing interrupted-uninstall
recovery case (452 passed / one failed). Its old assertion again omitted stderr;
the retained JSON report contains only the code mismatch. This is additional
unexplained evidence, not a resolved rerun. The test helper now persists every
nonzero direct CLI removal result, streams and resource/checkpoint names before
assertions or cleanup, and CI uploads those records. Expected refusals are recorded
too; the records do not themselves classify a result as unexpected. No full
environments or manifest contents are logged.

The exact path is the first case in tests/integration/process.test.ts: initialize
project B with preexisting middleware, execute its arbitrary launcher, await child
close, then invoke legacy uninstall. Fixture roots are unique mkdtemp directories;
the test helper waits for close, not exit. Other workers have independent roots.
ReadFile operations close their handles; uninstall validates hashes before creating
its rename checkpoint and removing files. No demonstrated synchronization, ownership
or stream defect explains the original Windows result. OS sharing remains a
possible external factor, not an established cause.

New evidence: three isolated lanes each run four immediate routed native/uninstall
cycles in both fresh and interrupted-removal modes, without retries. All 24 passed.
Each lane prepends its own launcher directory and asserts Arch execution events;
that assertion failed against the initial, incorrectly inherited fixture PATH.
The initial direct-native stress was weaker evidence and is superseded.
Failed lanes retain their fixture plus
operation/stage/path/stdout/stderr/exit/signal evidence. The original test also
captures resource names on failure. Existing cleanup errors remain test failures.

A deterministic real Windows test holds a managed launcher with FileShare.ReadWrite
(no delete sharing), signals readiness through stdout, and releases via stdin.
Uninstall returns 1 with operation/path/OS errno, leaves its ownership checkpoint
and the locked bytes intact; explicit recovery succeeds after release. This proves
the sharing-refusal/recovery contract, **not** the historical incident's mechanism.
No production retry, sleep, increased timeout or speculative repair was introduced.
The investigation remains open pending a captured recurrence or independent causal
evidence. This unresolved P0 blocks stability acceptance even with passing CI.

An additional Windows CI blocker is **UNRESOLVED**: the
[262040d push run](https://github.com/Nickshajtan/hcc-harness/actions/runs/41147708309)
timed out after 120 seconds in npm-cli.test.ts's initial linked/direct/PowerShell
help test; cleanup then failed with EBUSY on project C. Its same-head PR job passed.
The failed report does not identify which help await or PID remained pending; no
causal link to the uninstall incident is established. Product repair is held for
review under the milestone's unexplained-platform-failure stop condition.
Test-only diagnostics now snapshot help phase, PID/exit/signal, partial streams and
completed results, without environment dumps or cancellation changes. Ten fresh
prefix repetitions passed; that does not resolve the hang. A missing-ComSpec fault
verified diagnostic capture, not the historical cause. No retry or timeout increase.

## Tools and measurements

Pins unchanged: TypeScript 6.0.3, ESLint 10.12.0, typescript-eslint 8.71.2,
Prettier 3.9.10, Vitest/V8 5.0.5, Stryker core/runner 10.1.1 and
dependency-cruiser 18.7.0. No dependency, override or lockfile change.

| Measurement                                     |               Reproduced starting main | Measured implementation |
| ----------------------------------------------- | -------------------------------------: | ----------------------: |
| Lint errors / ordinary warnings                 |                                 0 / 87 |                  0 / 55 |
| Global V8 lines                                 |                                 83.06% |        94.95% (866/912) |
| Global V8 branches                              |                                 76.21% |        91.86% (565/615) |
| Process V8 lines / branches                     |                          100% / 97.82% |           100% / 97.77% |
| CLI policy/dispatch/presentation/signal mapping | 0% worker coverage in old commands/CLI |   100% lines / branches |
| Wizard workflow lines / branches                |    old combined wizard 70.83% / 72.54% |         98.59% / 95.55% |
| Affected subsystem max complexity / nesting     |                                 37 / 4 |                  27 / 3 |
| Max nonblank/noncomment function length         |                                     98 |                      61 |
| Subsystem modules / functions / classes         |                             4 / 23 / 1 |             12 / 33 / 1 |
| Subsystem physical lines                        |                                    389 |                     510 |
| Dependency graph                                |                 44 modules / 114 edges |  52 modules / 130 edges |
| Cycles / violations                             |                                  0 / 0 |                   0 / 0 |

Subsystem counts include cli.ts, commands.ts, wizard.ts, discovery.ts and their
extracted modules; no class was added. The parser remains a complexity review
hotspot, with direct syntactic variants rather than a command framework. More
imports/lines expose responsibilities; no claim of lower raw coupling is made.
Process consolidation removes duplicate PATH decision mutants/branches, not scope.

Starting check: 334 passed / 31 explicit skips, ordinary test phase 88.57s;
starting coverage: same counts, 86.76s. Final coverage: 456 passed / 31 explicit
skips, 127.73s; final check: 456 / 31, 126.09s test phase. Wizard: 76 unit cases and
15 real terminal scenarios, including partial-input interruption and an unowned
collision failure. Timings reflect load and are not performance benchmarks.
Analysis findings: 124 to 93 total; metric review triggers are 37 to 38 (complexity /
nesting / parameters / length: 8/11/3/15 to 9/10/3/16). New test/diagnostic lengths
remain visible; source readability is not inferred from warning totals.
Thin cli.ts and wizard/terminal.ts still show 0% in worker V8 despite real CLI and
PTY tests. All production sources remain included. Numeric scopes add only
measured CLI/Wizard modules; existing Core/lifecycle/process thresholds remain.

## Responsibilities and regression protection

Before: commands mixed syntax, effects, output and confirmation ownership;
wizard mixed readline, display, input policy, recovery/menu navigation and mutation.
Now: export-only facades retain imports; parsing returns explicit requests, dispatch
selects existing operations, status presentation formats results, native-run owns
CLI subscriptions/exit mapping. Wizard terminal, decisions and presentation are
separate; workflow reads as inspect/navigation/selection/confirmation/application.
Configuration results are select/changed/unchanged. No new ownership engine or
generic workflow framework was introduced. See [architecture](../architecture.md).

Subprocess characterization preceded extraction: usage diagnostics, exit 1 versus
2, streams, no-prompt uninstall and noninteractive confirmation. New tests cover
dispatch exclusivity, terminal closure on errors, no success after operation failure,
EOF/defaults, cancelled menu actions without discovery, input validation, recorded
recovery resumption and read-only inspection. Public export assertions protect the
compatibility facades. Original terminal, interruption, npm and runtime tests remain.

An independent POSIX fixture race was corrected locally: stderr readiness does not
guarantee stdout PID delivery. That assertion now parses the PID after close. It
does not explain the Windows incident. Existing child settlement/cancellation,
managed bytes, manifest/journal formats and checkpoint sequences are unchanged.

## Mutation evidence

Counts distinguish assertion kills from timeouts. No source ranges/mutators were
excluded. Complete report files are required; errors, ignored mutants and missing
evidence fail. Gates never give timeout-as-assertion credit.

| Scope                      | Killed / total | Survived / uncovered / timeout | Assertion-only |
| -------------------------- | -------------: | -----------------------------: | -------------: |
| CLI parsing                |        141/141 |                      0 / 0 / 0 |           100% |
| CLI dispatch               |          71/71 |                      0 / 0 / 0 |           100% |
| CLI status presentation    |          23/23 |                      0 / 0 / 0 |           100% |
| CLI native-run mapping     |          42/42 |                      0 / 0 / 0 |           100% |
| Wizard input decisions     |          34/35 |                      0 / 0 / 1 |         97.14% |
| Wizard workflow            |        133/146 |                      7 / 2 / 4 |         91.10% |
| Config                     |          87/93 |                      1 / 0 / 5 |         93.55% |
| Core + middleware/events   |        221/229 |                      6 / 2 / 0 |         96.51% |
| Lifecycle decision modules |        385/397 |                     10 / 2 / 0 |         96.98% |
| Process modules            |        301/313 |                     11 / 1 / 0 |         96.17% |

CLI/Wizard: 444/458, 96.94% assertion-only versus 98.03% Stryker, 279s under
concurrent full-suite load (earlier pilot: 114s).
Initial five-file pilot: 400 mutants, weaker workflow assertions and five timeouts;
later native-run extraction adds a complete scope, not an exclusion. The current
six-file scope is fixed. Config took 16s, Core 62s, lifecycle 71s, process 234s
under load. Hosted timing/evidence belongs in the PR; do not extrapolate platforms.

Final survivor review added a real invalid-state/pending-routing regression: a
changed owned file must block a resume offer before any prompt, preserving bytes
and journal. It also checks exact recorded resource lists and multi-route display.
These kill valid behavior gaps even where V8 percentages do not change.
Remaining survivors are defensive missing-desired-routes status (inspection cannot
emit that valid state), warning-delimiter variants and internal unchanged-result
strings that still map to the same public false result. Workflow loop-removal mutants time out; they are
visible, not assertion kills. Remaining process platform/access, code-less errno,
SIGTERM fallback and unreachable shebang fallback mutants retain their prior review.
Core/config/lifecycle decisions preserve their prior gates and known survivors.
Readline and static installation messages are not mutated in this focused pilot;
their real terminal/subprocess contracts are retained. Full-repository mutation is
not enabled. No impossible fixture states were manufactured to improve scores.

## Debt decisions and enforcement

**FIX NOW:** shared first-match PATH-key lookup preserving casing/duplicate order;
ENOENT/EACCES/ENOTDIR versus unexpected-error tests; JSON enters as unknown in
native/status assertions; frozen M1 output is independently narrowed before use;
journal fixtures are validated before intentional tampering; no-op callbacks use
explicit undefined results; assertions removed where richer result comparisons
are clearer. Wizard desired routes are narrowed with an internal invariant check.

The ChildExecution constructor stays: child/signal/resolve/reject already describe
its four responsibilities. An options object would not improve current call sites.
Existing lookup-miss code is explicit and tested; no generic error policy was added.
Production non-null assertions, dynamic deletion and test empty functions now block.
Warning fingerprints only pruned; identical-context limitations remain documented.

**DEFER:** 28 test non-null assertions, seven test unnecessary conditions, remaining
heterogeneous B1/subprocess JSON boundaries and matcher-related unsafe diagnostics.
These mix optional fixture lifetime, protocol-specific arrays and external payloads;
systematic narrowing needs fixture/protocol characterization rather than replacement
casts or a universal decoder. Two truthy environment fallbacks intentionally treat
empty strings as absent. Renderer relocation/B2, broad uninstall redesign, event
generic correlation and subprocess V8 aggregation need separate compatibility work.

**REJECT:** retries/sleeps as an incident repair, generic command/workflow frameworks,
constructor wrappers to game parameters, broad disables, synthetic impossible states,
raised thresholds and excluded critical sources. No production Core, lifecycle,
setup, middleware, events, config, native shim or child lifecycle implementation changed.

Security audit: two moderate dev-only vulnerable package entries remain through
Stryker 10.1.1 -> typed-rest-client 2.3.1 -> qs 6.15.1. Actual registry inspection
still shows no compatible newer 2.x typed-rest-client; it pins qs. No forced override
or unrelated upgrade. Audit used Node's system CA store, not disabled TLS.
This is **not a clean audit**. Production does not import Stryker.

## Validation and remaining limits

Run check, lint:report, test:coverage, all five mutation commands and
test:mutation:check, test:acceptance and test:wizard. CI must inspect actual
Ubuntu/macOS/Windows regression, wizard and runtime jobs plus the unchanged
`M2.2 runtime portability required` aggregate. Results and exact reviewed commit
are in the dedicated PR; local results alone are not platform verification.

Windows ARM64, every terminal emulator, real AI TUIs, real nvm/fnm, hostile filesystem
races and power-loss durability remain NOT TESTED. M2.2 B2 is not implemented.
Next priority is evidence for the unresolved uninstall incident and Windows npm
help lifetime, not metrics-driven
architecture work. Apply the [determinism standard](determinism.md); stability and
B2 readiness remain blocked until the incident is explained or specifically
characterized as external with causal evidence.
