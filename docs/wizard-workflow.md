# Dedicated wizard checks

`.github/workflows/wizard.yml` runs independently of the full Arch matrix on
Ubuntu, macOS and native Windows. It runs on relevant source/test/dependency
changes in pushes and pull requests, and exposes `workflow_dispatch` for manual
runs. Once present on the default branch, select **Actions → Wizard checks → Run
workflow**, then choose the branch to validate. No credentials or provider account
setup is required.

Run the same checks locally with Node 24.x and development dependencies installed:

```sh
npm ci
npm run test:wizard
```

This builds the CLI, runs 14 focused wizard/discovery unit tests, then runs 13
serial scenarios against actual CLI subprocesses attached to pseudoterminals.
The first scenario asserts that both stdin and stdout really are TTYs. The rest
cover selection cancellation, EOF, Ctrl+C (exit 130), installed default suggestions,
final-summary cancellation, custom names, reserved/duplicate rejection, accepted
init, configuration inspection/cancellation/route changes, default-No deinit,
configuration-menu removal cancellation, confirmed removal and reinitialization.
Read-only/cancel paths compare complete project file/directory snapshots. Changes
and removal must preserve edited middleware configuration and native fixture bytes.

The test-only dependency `node-pty` is pinned in package.json/package-lock.json.
Its install-script approval is scoped to that exact version for npm versions that
enforce dependency script approvals. It adds no production dependency and the
wizard runtime is unchanged. The runner uses POSIX PTYs and Windows ConPTY;
it runs outside Vitest worker threads because the native PTY bindings are not
thread-safe. Sessions are serial; each CLI exit is awaited and listeners are
disposed. After saving evidence and removing scratch files, the standalone runner
explicitly exits to release node-pty 1.1's retained Windows worker handles. This
does not replace or bypass any CLI exit-status assertion.
See the [official node-pty documentation](https://github.com/microsoft/node-pty)
for platform and native build prerequisites; supported prebuilt binaries are
used when supplied by the pinned package.

Tests create an isolated project/home/PATH in OS temporary storage, which must
support hard links for route changes. Suggested tools are presence-only fixtures;
no installed AI CLI, agent config, account or credential is accessed. Interaction
waits for prompts rather than relying on timed keystrokes, and timeouts fail the
job. It never changes the checkout's routing installation or parent-shell settings.

Each platform publishes a GitHub job summary and a `wizard-evidence-<os>` artifact
containing unit JSON, terminal `results.json`, and a text transcript per session.
Scratch paths and ANSI sequences are removed from terminal transcripts. Artifacts
are retained for 14 days and uploaded on test failures too. A missing report is
shown as **NOT RUN / no evidence**, never PASS. Local evidence is under
`.test-state/wizard/`.

These tests validate Arch's terminal interaction and ownership behavior. They do
not verify installed AI tool TUIs, every terminal emulator, or refreshed parent-shell
activation. Those remain separate manual checks in [testing.md](testing.md).

Validation status: the local Windows command passed all 14 unit tests and 13 real
terminal scenarios and exited successfully. Lint passed. Hosted matrix verification
is in progress; no hosted pass is claimed yet.
