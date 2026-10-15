# Implementation report — 2026-10-16

1. **Architecture:** project-local launchers, cwd-based nearest TOML discovery,
   native passthrough, immutable execution identity, three lifecycle phases,
   sequential middleware, validated environment preparation, all-attempted cleanup,
   execution-local typed events, and a local factory registry. Core is tool/provider
   independent. Only `demo` is a production demonstration module.

2. **Existing libraries:** hookable 6.1.2, Emittery 2.1.0, smol-toml 1.9.1,
   read-cmd-shim 7.0.1; TypeScript 6.0.3 and Vitest 5.0.5. Direct dependencies
   are pinned and `package-lock.json` contains the resolved dependency tree.
   Windows reuses licensed, checksum-verified Scoop C++ shims cpp/v0.3.0.

3. **Mise routing:** insufficient for the required plain-command fallback on tested
   Windows 2026.10.11. Configured A/B wrapper shims work, but unconfigured C/outside
   fail as invalid shims. `mise exec` alone passes and therefore did not prove the
   plain-command workflow. The selected small dispatcher closes that demonstrated
   gap. Mise remains the runtime/bootstrap/PATH activation manager. No production
   mise-wrapper strategy remains. See [the decision](architecture.md).

4. **Bootstrap:** in the Arch checkout, `mise run bootstrap`. Then, from each target
   project root, `node /absolute/path/to/arch/dist/cli.js init`. Mise activation/trust
   is required for ordinary command discovery; noninteractive invocation can use
   `mise exec -- claude`. Initialization and uninstall are idempotent and preserve
   preexisting user files; changed managed files produce explicit errors.

5. **Acceptance command:** `npm run test:acceptance`. The real selected launchers
   exercise the full A/B/C scenario, denial, cleanup, project switching, argument/cwd
   preservation, exact native launch counts, parallel execution, and uninstall.

6. **Executed results:** final `npm run check` passed type checking, linting, build,
   and **6 test files: 23 passed, 1 platform-specific skip, 0 failures** on native
   Windows x64, Node 24.19.0, mise 2026.10.11. The skipped POSIX signal test is
   replaced by passing real Windows Ctrl+C/Ctrl+Break tests, including direct-child
   cleanup. Both `npm run bootstrap` and exact `mise run bootstrap` succeeded with
   clean npm installs. Mise downloaded/activated a fresh managed Node in isolated
   local state; optional Windows version-alias symlink warnings were nonfatal.
   npm reported zero known vulnerabilities at install time.

7. **CI:** Ubuntu, macOS and native Windows jobs are configured, including all
   required checks and archived routing evidence. Hosted CI has not been executed
   in this session. Linux/macOS and Windows ARM64 remain **unverified**. The
   cross-platform Definition of Done is pending those results; this report does
   **not** declare the MVP cross-platform complete.

8. **Known limits:** arbitrary batch scripts/custom shell aliases are outside the
   native executable contract; standard npm Node/native `.cmd` targets are supported
   without a shell. Generated launchers capture installation paths. Interactive
   TUI smoke tests against real AI CLIs were not run. Forced Windows termination
   cannot run finally blocks, and descendant processes remain the native tool's
   responsibility. An earlier feasibility run hit mise's canonicalization permission
   panic while using OS temporary directories; isolated native fixtures were moved
   under the writable workspace and the final full suite passed. No claim is made
   that this fixes the upstream mise panic in all environments.

9. **Deferred:** RTK, MCP, skills, context, sandboxing, budget/DLP, provider/model
   routing, sessions, orchestration, remote events and dynamic module installation.
   No placeholder subsystems were added.

10. **Size:** approximately **490 physical TypeScript lines** in production `src/`,
    including the small external-package declaration. Tests, documentation,
    configuration, generated build output and unmodified vendored binaries are
    excluded.
