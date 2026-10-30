# Development and testing

## Ordinary production development

Use Node >=24.15.0 <25 (pinned 24.19.0), installed development dependencies and
mise 2026.10.11 on PATH, or set `MISE_BIN` to an absolute executable. Windows native
fixtures use `%SystemRoot%/Microsoft.NET/Framework64/v4.0.30319/csc.exe`.

```sh
mise run bootstrap                 # or npm run bootstrap with compatible Node
npm run check                      # typecheck, lint, build, all ordinary suites
npm run test:acceptance             # builds, then black-box routing scenario
npm run test:wizard                 # builds, focused unit tests + real terminals
```

Quality controls: `npm run format:check`, `npm run lint:report`,
`npm run check:dependencies`, `npm run test:coverage`, `npm run test:mutation`.
See the [quality baseline](standards/quality-baseline.md) for measured limits and debt.

Individual scripts: `typecheck`, `lint`, `build`, `experiment`, `test:unit`,
`test:integration`, `test:acceptance`, `test:wizard:terminal`. Build before individual
integration/terminal tests. Dependencies/tools need network for provisioning; tests
run mise offline and make no AI/provider calls. No CLI credentials are needed.
Npm link/unlink tests use temporary prefixes/config/cache, never the user's globals.

`npm run test:mutation:cli` measures parsing, dispatch, CLI signal mapping, status
presentation and Wizard decisions/workflow. It excludes real terminal tests from
mutation, not from regression. See [quality gates](standards/quality-gates.md).

`tests/integration/uninstall-stability.test.ts` runs three independent project lanes,
four init/native/immediate-uninstall cycles each, without retries. Failed lanes retain
their fixture and operation/stage/path/stderr/status/signal evidence. The Windows-only
sharing test holds a managed launcher until an explicit stdin barrier releases it,
verifies refusal/checkpoint retention, then requests recovery. A passing stress or
sharing test does not resolve the historical unexplained uninstall failure.

Register trusted middleware using [the architecture contract](architecture.md).
Tests/build configuration and dependency pins are the executable source of truth;
do not change assertions merely to accommodate a platform failure.

## Coverage and fixture ownership

`tests/support.ts` creates isolated HOME/USERPROFILE, mise config/data/cache and
PATH with adjacent A/B/C projects. Windows compiles native C# fixtures; POSIX uses
Node executables. An explicit CommonJS boundary prevents extensionless fixtures
from inheriting the repository's ESM scope. Real paths normalize OS temporary roots;
bounded cleanup retries accommodate Windows executable handle release, not errors.

- Unit suites cover configuration/discovery, immutable execution identity, middleware
  order/env conflicts/denial, awaited event delivery/contained diagnostics, cleanup,
  cancellation races, native resolution and ownership/checkpoints.
- Integration and acceptance execute actual launchers/native processes: stale PATH,
  cwd/args/stdio/statuses, passthrough, parallel isolation, recursion, denial, uninstall
  recovery and native binary preservation. POSIX also tests an acknowledged
  SIGTERM-ignoring child and forced-kill fallback.
- Frozen [M1 fixtures](../tests/fixtures/M1.md) precede stricter routing invariants:
  generated platform layouts, ownership flags, reordered properties, historical
  paths, edited/missing configs and partial removal remain covered.
- Reconciliation tests forcibly terminate a real IPC worker at persisted journal,
  stage/publication/deletion, manifest replacement and cleanup boundaries; Windows
  includes exe/shim separation. Resume occurs through the CLI. Real hard-link counts,
  full bytes and collisions are asserted; capability/sharing failures are also
  injected deterministically. There is no production test-only environment hook.
- `tests/feasibility/mise.test.ts` remains a measured experiment of the rejected
  persistent mise-wrapper approach. It compares plain-command native fallback with
  `mise exec` and records `.test-state/mise-<platform>.json`. Experiment observations
  do not relax selected-router acceptance assertions.

OS temporary storage must support hard links for reconciliation tests. An exFAT
checkout can build Arch while tests use capable temporary storage; no unsupported
filesystem fallback or silent publication skip is accepted.

## Workflows and evidence

| Workflow                                                            | Contract and artifacts                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [Arch checks](../.github/workflows/ci.yml)                          | Ubuntu/macOS/Windows typecheck, lint, build, experiment, unit/integration/acceptance; `routing-evidence-<os>`                     |
| [Wizard checks](../.github/workflows/wizard.yml)                    | Focused unit suite and 13 serial real CLI terminal scenarios; `wizard-evidence-<os>` JSON/transcripts                             |
| [Runtime portability](../.github/workflows/runtime-feasibility.yml) | Same nine real-subprocess contracts on all three platforms, plus terminal checks and Windows native bootstrap; `m22-runtime-<os>` |

The permanent portability workflow has no path filters and runs on push, PR,
merge-group and manual dispatch. `M2.2 runtime portability required` succeeds only
if the whole matrix succeeds. Main protection requires that check from GitHub
Actions app 15368, with strict/up-to-date checks and administrator enforcement.
Missing prerequisites, assertion failures or skipped shared runtime tests fail the
gate. JSON and Actions summaries show PASS / FAIL / NOT TESTED. Ordinary local runs
explicitly skip provisioned runtime tests without their opt-in variables; those
skips are not portability evidence. Keep all three workflows and required names.

Important inspected baseline evidence (feasibility, not production portability):

| Area                                                                                | Result     | CI evidence                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared runtime + native isolation/recovery/signals/terminal                         | PASS       | [Three-platform B1 matrix](https://github.com/Nickshajtan/hcc-harness/actions/runs/40868176348): 9/9 per platform, zero skips; Windows additional 21/21  |
| M1/M2/M2.1 regressions                                                              | PASS       | [Full matrix](https://github.com/Nickshajtan/hcc-harness/actions/runs/40868176254)                                                                       |
| Wizard                                                                              | PASS       | [Three-platform wizard](https://github.com/Nickshajtan/hcc-harness/actions/runs/40801339819): 14 focused unit tests and 13 terminal scenarios per runner |
| Supplemental Windows Node 20 TTY/native bootstrap                                   | PASS       | [Original B1 executable evidence](https://github.com/Nickshajtan/hcc-harness/actions/runs/40801963390)                                                   |
| Real nvm/fnm, Windows ARM64, AI CLI TUIs, refreshed parent shell, B2 stable install | NOT TESTED | Separate integration/review gates                                                                                                                        |

These are retained run links, not claims that every subsequent commit passed.
For current changes inspect that PR's actual jobs/artifacts. Local JSON lives under
ignored `.test-state/`; hosted artifact retention is finite, so keep reproducible
tests and run links rather than committing generated evidence files.

## Specialized B1 feasibility reproduction (opt-in)

This section provisions extra runtimes and exercises prototypes. It is separate
from ordinary production checks above and does not install or integrate a B2 bootstrap.

Build with real Node 24.19.0 and independently provision Node 22.12.0. Set:
`ARCH_RUNTIME_CONTRACT=1`, `ARCH_B1_NODE22=<absolute executable>`,
`ARCH_B1_MISE=<absolute real mise executable>`, and
`npm_execpath=<absolute npm/bin/npm-cli.js>`. On Windows, compile with
`scripts/b1/build-bootstrap.ps1` (Visual C++ x64 build tools/SDK required), then set
`ARCH_B1_BOOTSTRAP` to `.test-state/b1-bootstrap/arch-bootstrap.exe`.
The build accepts `-WindowsSdk <installed-version>` for a complete local SDK.

```sh
node node_modules/vitest/vitest.mjs run tests/feasibility/runtime-contract.test.ts --reporter=default --reporter=json --outputFile=.test-state/m22-runtime-contract.json
node scripts/b1/check-runtime-tty.mjs
```

The suite probes actual Arch Node 24 and native Node 22; tests generated npm PATH/
adjacent shims, exact arguments/env/cwd/stdio/exit, concurrent engines, console
cleanup and legacy recovery after removing historical Node/moving its checkout.
One assertion simulates PATH changes. A separate **real mise** assertion links local
temporary runtimes offline and executes 22 -> 24 -> 22. It modifies neither global
manager state nor profiles; this is not an nvm/fnm test.

Windows additionally sets `ARCH_B1_NODE20=<real Node 20.19.0 executable>` and runs:

```sh
node node_modules/vitest/vitest.mjs run tests/feasibility/runtime-bootstrap.test.ts tests/integration/npm-runtime.test.ts --reporter=default --reporter=json --outputFile=.test-state/m22-b1-executable.json
node scripts/b1/check-tty.mjs
node scripts/b1/summarize-runtime.mjs
```

The supplemental `check-tty.mjs` retains original Node 20 ConPTY coverage;
`check-runtime-tty.mjs` is the permanent three-platform Node 22 terminal contract.
Both run outside Vitest workers, await exits/cleanup, then explicitly exit to release
node-pty 1.1 Windows handles. The version-compatibility test uses real binaries,
not fake version strings alone. See [active design limits](runtime-portability.md).

## Wizard and manual integration

The wizard runner invokes isolated npm-linked Arch in POSIX PTYs/native ConPTY.
It asserts TTYs, input/EOF/Ctrl+C, suggestions/custom names/reserved duplicates,
selection/summary cancellation, init, configure/inspection, default-No and confirmed
deinit, reinit, unchanged native bytes and edited middleware preservation. Prompts
drive interaction; timeouts fail. Known macOS node-pty `spawn-helper` paths alone can
have their executable bit restored, with the preparation recorded. No real tools
are repaired. Workflow dispatch is available under Actions -> Wizard checks.

Before claiming real CLI integration, manually test an installed interactive tool
in two initialized scratch projects and a third unconfigured one: subdirectory
discovery, repeated project switching, stdin, resize/colors/cursor behavior,
Ctrl+C/Ctrl+Break cleanup, deinit/native fallback and the unaffected second project.
Separately verify fresh-shell mise activation/trust and prompt refresh; subprocess
mise-exec or init success cannot prove parent-shell behavior. These checks remain
NOT TESTED against real AI CLIs, and force-kill cleanup is not promised.
