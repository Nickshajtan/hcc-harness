# FS-1.0a: initial setup publication

Baseline: upstream `main` at `368391d` (fetched before implementation).
This change is independent of FS-1.1 and retains hard-link publication.

## Investigation and contract

`renderFiles()` supplies the first resources in this order:

| Final path                                         | Ownership / observer                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `.config/mise/conf.d/arch.toml`                    | Bootstrap-recorded hash; mise may read immediately                                                                   |
| `.arch/bin/.arch-router`                           | Bootstrap-recorded hash; native PATH filtering reads marker                                                          |
| `.arch/bin/<command>` on POSIX                     | Bootstrap-recorded hash; independent shell may execute immediately                                                   |
| `.arch/bin/<command>.exe`, then `.shim` on Windows | Each has its own recorded hash; independent shim consumer may read immediately                                       |
| `.arch/harness.toml`, only when absent             | `createdHarness` records provenance; existing valid user configuration is preserved; middleware may read immediately |
| `.arch/bootstrap.json`                             | Ownership authority and effective setup commit point; status reads and validates recorded hashes                     |

Command resources follow the supplied command order. Existing bootstrap state is
validated using historical hashes and route names, then setup returns without
rewriting anything. Equal preexisting bytes without bootstrap authority are still
foreign. Invalid existing harness configuration is rejected before writes.

Previously, each resource was written with `wx` at its final path, followed by
POSIX chmod. `wx` prevents replacement but makes empty/partial bytes visible.
Even bootstrap JSON could be partial. An interrupted write was not registered in
the rollback list. Reconciliation instead stages and hard-links complete resources,
with a journal for route-update recovery. Setup has no such journal.

The whole setup is **not atomic**: mise and PATH consumers do not consult bootstrap
readiness. A complete launcher can appear before its companion configuration.
This change guarantees per-file complete visibility, not multi-file readiness or
execution isolation. Status does not report initialized until a complete bootstrap
and matching managed files exist. No consumer/readiness protocol is redesigned.

## Correction

All intended contents are rendered before publication. Each is written exclusively
inside a new `.arch/.setup-*` directory, closed, given its final POSIX permissions,
and checked against the intended digest. The directory is on the same filesystem
as all managed paths under the project (nested mounts are unsupported). Every stage
is checked again before `publishExclusive()` publishes it. Bootstrap remains last.
There is one shared publication primitive for setup and routing reconciliation.

Before commit, only successfully published resources enter the rollback list.
Rollback runs in reverse order, checks safe paths, original file identity (using exact bigint device/inode values) and exact
intended digest, and stops on the first failure. Changed/replaced resources remain
untouched. Both errors remain available through `AggregateError([original, cleanup])`
with the initiating failure as cause. Publication errors retain the original OS
error as cause through the shared boundary. Permission errors happen before any
publication. These checks do not claim protection from hostile concurrent mutation.

Stages are retained on pre-commit failure for diagnosis, including incomplete stages.
They do not authorize adoption of existing final files. Successful commit removes
stages; cleanup failure reports that setup committed, preserves the bootstrap and
resources, and retains remaining stages. Repeated setup checks historical ownership
and succeeds without depending on stage cleanup. Missing stages during successful
cleanup are tolerated, so future consuming publication primitives do not require
another setup algorithm. Rollback stores identity before publication rather than
requiring a surviving stage.

## Abrupt termination and inspection

Before bootstrap: status remains `uninitialized`; already published complete files
are unclaimed residue. Setup refuses those final-path collisions even if bytes match.
There is no automatic setup recovery/deletion authority. Inspect `.arch/.setup-*`
and final files, then explicitly move unclaimed files aside before retrying. Do not
use reconciliation recovery to adopt them. A partial private stage alone does not
prevent a new setup attempt. After bootstrap: status validates all recorded resources
and reports initialized; leftover private stages may be inspected separately.

This preserves the existing manual handling of incomplete first setup while removing
partial final files. A future automatic setup recovery feature would need an explicit
ownership checkpoint; it is not silently inferred here. No journal schema changes.

## Filesystems and validation

NTFS, APFS and Linux local filesystems require working hard links and ordinary local
filesystem semantics. Windows exFAT setup now fails closed at the first publication
with the shared actionable diagnostic. It does not create bootstrap, overwrite a
foreign resource or fall back to direct writes. This is **not exFAT lifecycle support**.
No power-loss durability, network filesystem or hostile path-race guarantee is added.

Tests use real NTFS temporary projects on Windows, fault-injected native filesystem
calls, and independent Node subprocesses synchronized by IPC immediately before/after
actual publication. Termination is real, not a mocked exception. Tests inspect exact
bytes, ownership hashes, commit state, stage residue and competing process outcomes.

Executed results and CI links are recorded in the PR. Linux/macOS results require
inspection of their actual CI runs; local Windows success does not establish them.

## Review notes and reproducible checks

Production changes are confined to setup and the shared publication diagnostic.
No renderer bytes, routing commands, journal/manifest schema, mise architecture,
process transport or stable installer behavior changes. Test fixtures now default
to the system temporary filesystem instead of the checkout filesystem: a checkout
on exFAT must not make NTFS lifecycle regressions test an unsupported consumer mount.

The analysis-only complexity report changes `setup` from 81 nonblank/noncomment
lines and complexity 16 to 117 lines and complexity 24. Preparation, publication,
commit, cleanup and reverse rollback remain explicit in the coordinator; the narrow
identity-and-bytes cleanup check is a private helper. This is a documented review
exception to analysis targets, with no suppression or warning-baseline adjustment.
Strict production lint still requires zero warnings. A generic transaction layer
would increase the surface and obscure the commit/error ordering for this fix.

Local validation commands:

```sh
npm run typecheck
npm run build
npm run lint
npm run lint:baseline
npm run format:check
npm run check:dependencies
npm run test:quality
npm run test:coverage
npm run test:mutation:effects
node scripts/report-effects-mutation.mjs
```

On the tested Windows machine, the default installed SDK lacked
`specstrings_strict.h`. The existing `ARCH_WINDOWS_SDK=10.0.17763.0` build override
works; no SDK discovery/build code is changed. Run `npm run build:bootstrap` before
runtime integration. The ordinary coverage run leaves explicitly optional runtime
profiles skipped; the mandatory runtime CI workflow supplies their prerequisites.
POSIX chmod fault injection is exercised on Linux/macOS, not claimed as a Windows test.

## Validation evidence

Windows x64 / Node 24.19.0, local NTFS consumer projects:

- PASS `npm run check` with the SDK override above: 601 passed, 33 explicitly
  skipped tests; typecheck, strict lint, zero-warning ratchet, formatting,
  dependency checks, build/bootstrap and 24 quality-tooling tests passed.
- PASS complete coverage run: 600 passed / 33 skipped at the production snapshot;
  the subsequent private-stage collision test also passed. Setup coverage was
  98.61% lines / 92.10% branches, above unchanged 95% / 90% gates.
- PASS final focused setup contracts: 19 passed / one POSIX chmod case skipped.
  The five real interruption/concurrency contracts passed separately and in the
  ordinary suite. Identical and conflicting independent publishers are covered.
- PASS reliability: 26 passed / one POSIX-only npm case skipped; a fresh evidence
  directory validated four profiles, 32 sequences and 96 first-attempt operations.
  Real Windows sharing refusal is an expected assertion, not a hidden retry.
- PASS actual exFAT fail-closed probe: original `EISDIR`; foreign harness unchanged;
  no bootstrap or first target; status `uninitialized`. Foreign-stage and final-path
  collisions also have deterministic byte-preservation tests.
- PASS Stryker 10.1.1 full effect pilot (15m11s), followed by supported incremental
  reruns after test strengthening (2m41s and 1m45s). Final setup: 126 killed, seven
  survived, one no-coverage, zero timeouts/errors; assertion-only **94.03%**. All
  five complete-file 85% gates passed. The shared routing-file scope has three
  timeouts, which earn no credit; its assertion-only result still passes (90.91%).

Reviewed remaining setup mutants: cross-device identity and disappearance between
`lstat`/read are defensive checks beyond the supported same-filesystem/non-hostile
mutation assumptions; uppercase versus lowercase normalization is equivalent for
Windows ASCII route identity; forcing Windows normalization is distinguishable on
POSIX; the remaining permission-condition mutants and uncovered chmod body need
POSIX execution. No mutant was excluded. The hosted POSIX effect pilot also passed.

At commit `1db952f` (production source unchanged by later assertion/document edits):
[Windows/Linux/macOS regression matrix](https://github.com/Nickshajtan/hcc-harness/actions/runs/41690093732),
[all-platform runtime matrix and required aggregate](https://github.com/Nickshajtan/hcc-harness/actions/runs/41690093738),
[quality and effect mutation jobs](https://github.com/Nickshajtan/hcc-harness/actions/runs/41690099189),
and [dedicated Windows reliability](https://github.com/Nickshajtan/hcc-harness/actions/runs/41690099196)
passed. A duplicate PR runtime attempt failed to acquire a macOS hosted runner;
that infrastructure failure is retained, not called a test PASS. Final-head CI status
is recorded in the PR rather than inferred from these earlier runs.

Earlier failures were retained: checkout-local tests hit exFAT as intended once
setup required links; old POSIX assertions expected chmod on final paths; Windows
TEMP used an 8.3 alias while mise reported canonical cwd. Fixtures now use canonical
system temporary paths and assert staged permissions plus final file modes. Local
reliability validation initially encountered mixed old reports; fresh isolated
reports passed. No expectation, threshold or production failure was suppressed.
Raw local mutation/coverage/reliability evidence is retained outside the repository.
