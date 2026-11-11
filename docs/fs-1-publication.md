# FS-1: portable exclusive publication decision

> Historical implementation/investigation record. Original observations and verdicts
> below retain their revision and scope. Current guidance: [architecture](architecture.md),
> [compatibility](compatibility.md), and [validation index](validation/README.md).

Historical Node-API investigation. [FS-1.2](fs-1.2-native-publication.md) subsequently
adds a native Windows bridge and documents current NTFS/exFAT support.

**Decision: DESIGN BLOCKED.** No evaluated primitive in the supported Node filesystem
API provides both complete-file visibility and atomic refusal of an existing final
file without hard links. Keep production behavior unchanged. exFAT reconciliation
remains unsupported; successful initial setup is not evidence of full lifecycle support.

Baseline fetched from upstream `main` on 2026-11-03:
`15f46357d8dd6fb9cc8a33933b6fab08b5fd7ac2`. The original checkout was the VS-1
snapshot `769a1f6f80adf0dc594105c793bce941986b132c`; this investigation uses the
new baseline, not an assumption of equivalence. No production or schema changes
are proposed. This is the required investigation/decision gate, not completed FS-1 acceptance.

## Publication paths and ownership

There are exactly two production callers of `publishExclusive`:

| Caller                                  | Stage, relative to project                             | Final target                                                                                        | Contract and interruption behavior                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifecycle/index.ts`, `reconcileRoutes` | `.arch/routing.stage`                                  | `.arch/routing.json`                                                                                | Complete JSON recovery authority, exclusively published after validating bootstrap and absence of uninstall checkpoint. Independently observable immediately. Before publication, an orphan stage grants no recovery authority; status warns and a new update refuses it. After publication, the journal authorizes only its validated before/after plan.                                          |
| `lifecycle/recovery.ts`, `applyJournal` | `.arch/.routing-<journal UUID>-<addition index>.stage` | `.arch/bin/<command>` on POSIX; `.arch/bin/<command>.exe` and `.arch/bin/<command>.shim` on Windows | Complete script/native executable or shim configuration. Journal payload hashes must match the after manifest; retained/current bytes are checked. Each addition is immediately observable by independent consumers before manifest commit. Interruption retains the journal; absent permitted additions can resume, matching published additions can be accepted, differing bytes block recovery. |

The renderer also produces `.config/mise/conf.d/arch.toml` and
`.arch/bin/.arch-router`. Reconciliation retains their recorded hashes; journal
parsing rejects changing them. Consequently they are not published additions in
a valid current transaction. Initial setup creates them directly. Windows `.shim`
files are configuration consumed by the native launcher and require the same
complete-file publication guarantee as executables. Journal JSON also must not
be exposed partially to another recovery/status process.

No lifecycle code inspects inode identity or link counts. Recovery and cleanup
use paths, journal validation and SHA-256 bytes. Hard links currently leave the
stage present, but missing stages are permitted by `verifyStage`; its cleanup is
optional. A rename-based primitive would consume the stage and would require
explicit recovery tests, rather than an inode-identity migration. Existing hard
links alias the stage and final bytes: immutable stages are an assumption, not
protection against subsequent writes through either name.

The bounded audit covered planning, renderer, initialization, publication,
manifest/journal parsing, recovery validation/effects, inspection and removal.
The only production hard-link use under `src/lifecycle` is `routing-files.ts`.
Hard-link alias tests for independently installed runtimes are unrelated and
remain unchanged.

## Exact guarantees and limits

An individual successful `link` exposes already-written staged bytes and fails
if the destination exists, including an identical-content collision. Preflight
alone is not the no-clobber boundary. It neither writes final bytes incrementally
nor replaces a foreign destination that appears after preflight.

The surrounding protocol supplies payload/hash validation, historical ownership,
permitted missing states, additions-before-removals, validation before owned
manifest replacement, and recovery authority removed last. It does **not** make
the route set, or a Windows exe/shim pair, atomically visible. Consumers do not
consult the journal before opening launchers/shims. Status reports valid pending
recovery separately from completed initialization and rejects invalid bytes.

An exclusive reservation establishes a claim, not complete bytes. Exclusive file
creation establishes a new name, not readiness. Atomic replacement preserves
visibility but permits destruction of a previous destination. Transaction readiness
cannot retroactively hide a partial executable already observed by an independent
reader. Multi-file consistency is a separate, currently absent guarantee.

Assumptions remain a trusted local project, no hostile concurrent path/stage
mutation, and one supported lifecycle mutator per project. Publication must still
reject late destination collisions, including noncooperating ordinary external
writers. Existing symlink checks are pre-operation validation, not a hostile-race
lock. Neither this investigation nor existing publication establishes fsync or
power-loss durability. Process termination recovery is a narrower contract.

Initial `installation/setup.ts` already writes final paths with `wx`, followed by
permission updates and manifest creation. It does not provide reconciliation's
complete-file visibility guarantee. The existing removal checkpoint also uses
check-then-rename, within the single-mutator contract. These findings limit claims
about current behavior; they do not justify weakening reconciliation or silently
expanding FS-1 into initialization/removal redesign. A future full-lifecycle S6
claim must separately address initial setup's direct writes.

## Candidate comparison

| Candidate                                        | No-clobber                                            | Independent-reader safety                                                                                                                                                                              | Recovery/concurrency                                                                                                                                                                                                                                                                         | Decision                                                         |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A: `open('wx')`, write, close                    | Exclusive creation rejects existing targets           | Empty/partial final file is visible before completion; shell scripts and shim config can contain usable prefixes. Closing, syncing, changing permissions or hashing later does not hide earlier bytes. | Termination leaves a partial final path. A claim cannot authorize deleting ambiguous modified bytes.                                                                                                                                                                                         | Reject: G3/S6.                                                   |
| B: stage then Node `rename`                      | Can replace a destination on Windows, Linux and macOS | Complete prepared bytes can become visible through same-filesystem rename                                                                                                                              | Preflight/lock plus rename still overwrites a file created by an external writer between check and rename.                                                                                                                                                                                   | Reject: S1.                                                      |
| C: private claim plus staging/rename             | Serializes cooperating claim observers only           | Staging solves byte preparation, not final exclusive publication                                                                                                                                       | External writers ignore the claim; final `wx` reintroduces A, rename reintroduces B. Crashed claims need cross-process ownership/recovery rules; PID or age alone cannot authorize removal. A reservation at the final path is itself visible and must be replaced or incrementally written. | Reject under unchanged layout/readers.                           |
| D: `copyFile(COPYFILE_EXCL)`                     | Refuses existing destination                          | Node explicitly does not guarantee atomic copying; clone flags allow fallback copying or require unsupported capabilities                                                                              | Destination may be visible while incomplete. Failed-copy cleanup is not a crash protocol.                                                                                                                                                                                                    | Reject: G3/S6.                                                   |
| D: symlink, prepared directory, readiness marker | Some namespace operations create exclusively          | Symlinks violate the project boundary and do not solve exFAT. Directory/marker readiness requires readers and final layout to change.                                                                  | Stable installer completion directories work because its consumers observe a different readiness contract. Existing launcher consumers do not.                                                                                                                                               | Reject as a drop-in replacement.                                 |
| D: native exclusive rename                       | Potentially supplies the missing primitive            | Same-filesystem prepared-file publication is the appropriate boundary                                                                                                                                  | Requires OS-specific API access and filesystem proof not exposed by Node `rename`; stage consumption must be tested.                                                                                                                                                                         | Smallest alternative to investigate separately; not implemented. |

The conclusion applies to the current supported Node 24 API, including the
declared minimum 24.15.0. It is not a claim that the operating systems themselves
lack exclusive rename. Linux has `renameat2(RENAME_NOREPLACE)` with filesystem
support requirements; Apple defines `RENAME_EXCL`; Windows exposes move flags.
Node exposes no corresponding no-replace rename option. The inspected libuv
1.52.1 Windows implementation explicitly requests `MOVEFILE_REPLACE_EXISTING`.

## Smallest viable alternative and decision gate

Keep the names, layout, journal, mise integration, installer and transport. Obtain
a narrowly scoped supported binding for **same-filesystem, atomic no-replace
rename of a fully verified regular file**, with explicit unsupported errors.
Evaluate native Windows move without replacement/copy flags and the corresponding
Linux/macOS exclusive-rename operations. This is a future feasibility proposal,
not a verified algorithm or authorization to add a native addon. No measured
dependency/build/packaging justification has been established in this investigation.

If that API access becomes acceptable, first prove Windows NTFS/exFAT semantics,
collision identity/permissions preservation, process interruption, and stage
consumption compatibility at both callers. Keep hash/symlink validation and fail
closed on unsupported operations. An additional claim state is not currently
justified: it does not supply the missing final-path primitive. The alternative
of readiness-aware immutable route bundles changes consumers and layout much
more substantially and is outside this milestone.

## Executed evidence

Windows, Node 24.19.0, libuv 1.52.1, baseline above. Read-only volume inventory
confirmed distinct NTFS and exFAT volumes. Disposable probes used one uniquely
owned directory on each. Raw JSON evidence is retained in an OS temporary evidence
directory outside the source repository; no personal paths are committed.

The **same probe logic** on both filesystems observed an empty final file after
`open('wx')`, a readable prefix after a partial write before close, rejection of
an exclusive-copy collision, and replacement of existing bytes by `rename`.
These are deterministic counterexamples, not timing-based stress tests. Hard-link
creation succeeded on NTFS and failed on exFAT with original `EISDIR`, syscall
`link`. That code is the observed result, not a universal exFAT error code.

The same built lifecycle API probe initialized `first`, preserved a foreign file,
then reconciled to `first, second`. NTFS completed. exFAT failed first journal
publication, preserving the old bootstrap bytes and nonempty `routing.stage`,
with no `routing.json`. Status remained initialized for the old route set with
orphan-stage warning semantics. Ordinary deinitialization preserved the foreign
file on both volumes. These probes used development-built APIs and **are not**
the independently installed external-consumer smoke test.

| Check                                                                                                                                                                                                                  | Result                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                                                                                                                                                                                    | PASS                                                                                                                                                                                                                                                         |
| `npm run build`                                                                                                                                                                                                        | PASS                                                                                                                                                                                                                                                         |
| `npm run lint`                                                                                                                                                                                                         | PASS; no diagnostics                                                                                                                                                                                                                                         |
| `npm test -- tests/unit/lifecycle.test.ts tests/unit/lifecycle-effects.test.ts tests/unit/lifecycle-decisions.test.ts tests/integration/lifecycle.test.ts`                                                             | PASS: 3 files, 76 passed, 1 existing POSIX-only permission test skipped on Windows. `lifecycle-decisions.test.ts` does not exist and selected no additional file. Includes actual subprocess interruption/recovery and late destination collision injection. |
| `npm test -- tests/unit/ownership.test.ts tests/unit/routing-journal.test.ts tests/unit/manifest.test.ts tests/unit/lifecycle-contract.test.ts tests/unit/setup-contract.test.ts tests/unit/recovery-evidence.test.ts` | PASS: 6 files, 94 passed, no skips                                                                                                                                                                                                                           |
| Same primitive/lifecycle probes on real NTFS and exFAT                                                                                                                                                                 | PASS as baseline characterization; exFAT reconciliation remains unsupported                                                                                                                                                                                  |
| New-algorithm unit/fault/concurrency suite, full NTFS/exFAT acceptance suite                                                                                                                                           | NOT TESTED: no qualifying implementation; existing regressions ran on NTFS temporary fixtures                                                                                                                                                                |
| Independent installed consumer, native `--version`, mise activation and recovery on exFAT                                                                                                                              | NOT TESTED: implementation decision gate failed; no paid inference used                                                                                                                                                                                      |
| Linux/macOS execution, full regression/runtime matrix, mutation pilots, complexity report                                                                                                                              | NOT TESTED: documentation-only decision; no production/test/tooling changes or new production complexity                                                                                                                                                     |

No thresholds, warnings, contracts or tests were weakened. Existing compatibility
statements remain authoritative. FS-1 A/B are not achieved; C-F have only baseline
evidence, not replacement-algorithm certification. G is preserved by making no
production changes. H is limited to the explicitly executed evidence. No claim of
inspected CI success, interactive-terminal acceptance, antivirus causality or
resolution of historical executable-lifetime failures is made.

`npm run format:check`: PASS after formatting the new document; the first run
reported its table alignment as FAIL. `git diff --check`: PASS. No production
complexity diagnostics were introduced because production files are unchanged.

## Reproduction

Use the baseline and supported Node version above, install the repository's
development dependencies, build, then run the exact test commands above. Tests
use OS temporary directories; confirm their filesystem before interpreting results.
For primitive probes, save this as an `.mjs` file **outside the repository**, then
run `node probe.mjs <existing-disposable-parent>` once on NTFS and once on exFAT.
The parent must be trusted and not symlinked; never pass somebody else's stage or
launcher. Only the uniquely created child directory is removed.

```js
import assert from 'node:assert/strict';
import { mkdtemp, open, writeFile, readFile, rename, copyFile, link, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';

const parent = resolve(process.argv[2]);
const root = await mkdtemp(join(parent, 'arch-fs1-probe-'));
const target = join(root, 'target');
const stage = join(root, 'stage');
try {
  const handle = await open(target, 'wx');
  try {
    assert.equal((await readFile(target)).length, 0);
    await handle.writeFile('prefix');
    assert.equal(await readFile(target, 'utf8'), 'prefix');
  } finally {
    await handle.close();
  }
  await writeFile(stage, 'complete', { flag: 'wx' });
  await assert.rejects(copyFile(stage, target, constants.COPYFILE_EXCL), { code: 'EEXIST' });
  assert.equal(await readFile(target, 'utf8'), 'prefix');
  await rename(stage, target);
  assert.equal(await readFile(target, 'utf8'), 'complete');
  await writeFile(stage, 'prepared', { flag: 'wx' });
  let linkResult;
  try {
    await link(stage, join(root, 'linked'));
    linkResult = 'success';
  } catch (error) {
    linkResult = { code: error.code, syscall: error.syscall };
  }
  console.log({ node: process.version, uv: process.versions.uv, linkResult });
} finally {
  assert.ok(root.startsWith(join(parent, 'arch-fs1-probe-')));
  await rm(root, { recursive: true });
}
```

Before any future acceptance claim, add the complete proposed-algorithm contract
suite, including independent identical/conflicting publishers and every affected
resource type, then run unchanged tests against both filesystems. Run the requested
independent stable installation/exFAT consumer smoke test only after that gate.
Do not treat this baseline failure probe as its substitute.

## Primitive references

- [Node 24.15 filesystem API and flags](https://nodejs.org/download/release/v24.15.0/docs/api/fs.html): `wx`, exclusive copy, non-atomic copy, rename signature.
- [libuv 1.52.1 Windows filesystem implementation](https://github.com/libuv/libuv/blob/v1.52.1/src/win/fs.c): `fs__rename` uses replacement.
- [Microsoft MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw): replacement/copy flags and failure reporting.
- [Linux rename manual](https://man7.org/linux/man-pages/man2/rename.2.html): replacement and `RENAME_NOREPLACE` filesystem dependency.
- [Apple rename manual](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/rename.2.html): existing destination removal.
- [Apple XNU rename flags](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/stdio.h): `RENAME_EXCL` definition; not an exFAT validation result.
