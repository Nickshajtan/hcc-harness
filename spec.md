# Arch Harness — M2: Setup Wizard & Routing Lifecycle

**Implementation specification for Codex**

## 1. Objective

Extend the existing Arch Harness MVP with user-friendly, project-scoped installation and routing management.

Users must be able to:

- Initialize Arch interactively.
- Discover available CLI tools.
- Select which executable commands Arch should route.
- Inspect current installation and routing state.
- Add or remove routed commands after initialization.
- Reconfigure routing without destroying existing middleware configuration.
- Deinitialize Arch safely, restoring native command resolution.
- Use all operations non-interactively for scripts and CI.

The implementation must preserve the existing execution architecture, middleware lifecycle, and native fallback behavior.

**Primary principle:** The wizard is a presentation layer over deterministic, testable setup operations.

## 2. Existing architecture

Read and understand these files before implementation:

- `src/cli.ts`
- `src/setup.ts`
- `src/core.ts`
- `src/process.ts`
- `src/config.ts`
- `src/middleware.ts`
- `docs/architecture.md`
- `docs/testing.md`
- `README.md`

Current behavior:

- `init [commands...]` initializes project-local routing.
- `init` defaults to `claude` and `codex`.
- `uninstall` removes Arch-owned resources.
- `run <command> -- [args...]` is the internal dispatcher.
- Routing is activated through mise and project-local launchers.
- `.arch/bootstrap.json` records managed files and SHA-256 hashes.
- `.arch/uninstall.json` supports interrupted uninstall recovery.
- `.arch/harness.toml` contains middleware configuration.
- Managed-file modifications and collisions block unsafe operations.

Do not replace this architecture.

Preserve the current process execution, event bus, and middleware APIs.

## 3. CLI contract

Introduce the following public commands:

```text
arch init
arch configure
arch route list
arch route add <command...>
arch route remove <command...>
arch status
arch deinit
arch --help
```

Retain compatibility with:

```text
arch init claude codex
arch uninstall
arch run <command> -- [args...]
```

`uninstall` remains a backward-compatible alias for `deinit`.

`run` remains an internal dispatcher operation, not a user-facing wizard action.

### 3.1 Interactive behavior

- `arch init` with an interactive TTY launches the setup wizard.
- `arch configure` with an interactive TTY launches the configuration wizard.
- `arch deinit` with an interactive TTY displays a removal plan and requests confirmation.
- `arch status` and `arch route list` never require interaction.

### 3.2 Non-interactive behavior

Explicit command arguments must not trigger prompts.

Examples:

```bash
arch init claude codex gemini
arch route add gemini
arch route remove codex
arch deinit --yes
arch status --json
```

If a required decision cannot be made without interaction, fail with a clear error and usage guidance.

Do not silently accept destructive operations in non-interactive environments.

Maintain meaningful exit codes and stderr diagnostics.

## 4. Wizard UX

### 4.1 Initialization wizard

Proposed flow:

```text
Arch Setup

Project:
  /absolute/path/to/project

Detected CLI tools:
  [x] Claude Code     claude
  [x] OpenAI Codex    codex
  [ ] Gemini CLI      gemini
  [ ] OpenCode        opencode
  [ ] Aider           aider

  Add custom executable...

Configuration:
  Project-scoped installation
  Native fallback enabled
  Middleware configuration preserved

Proceed? [Y/n]
```

Requirements:

1. Display the resolved project root.
2. Detect supported executable candidates from the native PATH.
3. Present the detected tools as suggestions, not hardcoded restrictions.
4. Allow arbitrary custom executable names accepted by the existing validation rules.
5. Prevent duplicates and reserved command names.
6. Allow users to cancel without modifying files.
7. Display a summary before applying changes.
8. Report the resulting managed paths and activation instructions.

CLI discovery must not execute the discovered tools.

Do not inspect credentials, agent configuration, or provider accounts.

Use existing command validation rules unless a change is explicitly justified.

If no CLI tools are detected, allow custom entry or cancellation.

Do not automatically install missing CLI tools.

### 4.2 Configuration wizard

When Arch is already initialized:

```text
Arch Configuration

Current routes:
  [x] claude
  [x] codex
  [ ] gemini

Actions:
  - Update routed commands
  - Inspect installation
  - Deinitialize Arch
  - Cancel
```

Changing routes must preserve:

- `.arch/harness.toml`
- User modifications to middleware configuration
- Native executable installations
- Unrelated project files

Do not implement middleware configuration editing in this milestone.

The wizard manages routing only.

### 4.3 Deinitialization wizard

Example:

```text
Arch Deinitialization

Project:
  /absolute/path/to/project

Managed resources:
  .arch/bin/...
  .config/mise/conf.d/arch.toml
  .arch/bootstrap.json

Preserved resources:
  Modified or pre-existing .arch/harness.toml
  Unrelated project files
  Native CLI installations

Remove Arch routing from this project? [y/N]
```

Default answer must be **No**.

Cancellation must produce no filesystem changes.

After successful removal, display instructions for refreshing the shell environment.

## 5. Installation lifecycle

Define explicit installation states:

```text
UNINITIALIZED
INITIALIZED
RECOVERY_PENDING
INVALID_STATE
```

Do not introduce persistent state merely to represent values that can be derived from the existing manifests.

### UNINITIALIZED

- No active bootstrap manifest.
- No pending uninstall journal.
- Initialization is allowed, subject to collision checks.

### INITIALIZED

- Bootstrap manifest exists and is valid.
- Managed resources match recorded ownership.
- Routing changes and deinitialization are allowed.

### RECOVERY_PENDING

- Uninstall journal exists.
- Initialization and route modification are blocked.
- Deinitialization resumes the interrupted operation.

### INVALID_STATE

Examples:

- Conflicting bootstrap and uninstall manifests.
- Invalid manifest structure.
- Modified managed files.
- Missing managed files outside recovery.
- Unresolvable ownership conflicts.

Mutating operations must fail safely with actionable diagnostics.

Do not automatically repair ambiguous ownership.

## 6. Routing management

### 6.1 Add routes

```bash
arch route add gemini
```

Expected behavior:

- Validate command names.
- Detect existing routes.
- Preserve current routes.
- Generate only the required new launchers.
- Update ownership metadata.
- Maintain the existing mise integration.
- Preserve middleware configuration.

Adding an existing route should be idempotent.

### 6.2 Remove routes

```bash
arch route remove codex
```

Expected behavior:

- Validate current ownership.
- Remove only Arch-owned launchers for the selected command.
- Preserve all other routes.
- Preserve native executable installations.
- Update ownership metadata.

Removing a route must not uninstall Arch.

Removing the final route should be rejected with guidance to use `arch deinit`, unless a clearly documented empty-routing state is deliberately supported.

### 6.3 Configure routes

The wizard should apply the selected routes as one desired-state update.

Example:

```text
Current:
  claude, codex

Desired:
  claude, gemini
```

The operation must avoid an intermediate user-visible state in which routing is unintentionally removed.

Do not implement route changes as a naive `uninstall()` followed by `setup()`.

Introduce a dedicated routing reconciliation operation.

## 7. Filesystem safety and recoverability

This is a critical part of the milestone.

The current setup/uninstall implementation already uses:

- Exclusive file creation.
- Ownership manifests.
- SHA-256 validation.
- Rollback during setup.
- Recoverable uninstall checkpoints.

Preserve these guarantees.

For routing changes:

1. Validate the complete existing ownership state.
2. Validate the desired command set.
3. Preflight filesystem collisions.
4. Compute the complete change plan.
5. Apply changes with explicit ownership tracking.
6. Persist the resulting ownership state.
7. Recover safely from interrupted operations.

A partial route update must not leave an unrecoverable installation.

Do not claim full filesystem transactionality unless actually implemented.

Design and test the recovery strategy before implementing mutations.

Do not overwrite modified managed files.

Do not delete unknown or user-owned files.

Do not delete unrelated directories.

Do not use recursive directory deletion as a shortcut.

Preserve existing uninstall recovery behavior.

If a new operation journal is needed for route reconciliation, keep it minimal and explain why the existing ownership manifest is insufficient.

Avoid unnecessary locking infrastructure, but document concurrent mutation limitations and reject detectable conflicting operations.

## 8. Configuration ownership

`.arch/harness.toml` must remain independent from route selection.

Rules:

- A newly generated default configuration may be removed during deinitialization only if unchanged.
- Modified configuration must be preserved.
- Pre-existing configuration must be preserved.
- Routing changes must never rewrite middleware configuration.
- Existing middleware configuration must remain valid after route changes.

Preserve the current ownership distinction between generated and pre-existing configuration.

## 9. CLI discovery

Provide a small discovery abstraction:

```ts
interface CliCandidate {
  command: string;
  available: boolean;
  executablePath?: string;
}
```

This is an illustrative interface, not a required public API.

Candidate discovery must:

- Respect platform-specific executable resolution.
- Avoid identifying Arch's own launchers as native tools.
- Avoid recursive routing.
- Handle Windows executable extensions appropriately.
- Avoid executing candidates.
- Avoid accessing unrelated project files.
- Work when mise is unavailable or not activated, with clear diagnostics.

Known candidates may include:

```text
claude
codex
gemini
opencode
aider
```

The candidate catalogue must be extensible without changes to the routing engine.

Custom executable names must remain supported.

Distinguish:

- Known and installed.
- Known but not installed.
- Custom command.

The wizard may recommend installed candidates, but must not force them.

## 10. Status and diagnostics

Implement:

```bash
arch status
arch status --json
arch route list
```

Status should report:

- Project root.
- Installation state.
- Routed commands.
- Managed file integrity.
- mise integration state, where detectable.
- Pending recovery.
- Actionable warnings.

Example JSON shape:

```json
{
  "schema": 1,
  "projectRoot": "/project",
  "state": "initialized",
  "routes": ["claude", "codex"],
  "integrity": "valid",
  "recoveryPending": false
}
```

The exact schema may be refined during implementation.

Do not expose secrets or environment values.

Do not include machine-specific paths in test snapshots.

Status must be read-only.

## 11. Architecture constraints

Preserve:

- Project-scoped installation.
- Native executable fallback.
- No global PATH modifications.
- No global agent configuration modifications.
- No background daemon.
- No provider SDK dependency.
- No dynamic downloads.
- No remote service.
- No agent orchestration.
- No changes to the middleware lifecycle.

Avoid introducing a general-purpose plugin framework.

Use a small CLI interaction dependency only if justified.

Prefer deterministic setup services and thin interactive adapters.

The wizard must not contain filesystem mutation logic.

The same setup operations must be callable programmatically and from non-interactive CLI commands.

## 12. Testing requirements

### Unit tests

Cover:

- Command validation.
- CLI discovery.
- Default selection.
- Custom command selection.
- Duplicate prevention.
- Reserved names.
- Installation-state detection.
- Routing change planning.
- Manifest validation.
- Cancellation before mutation.
- Non-interactive argument handling.
- JSON status serialization.

### Integration tests

Cover:

- Fresh initialization.
- Repeated initialization.
- Add route.
- Remove route.
- Replace route set.
- Preserve middleware configuration.
- Preserve native binaries.
- Project isolation.
- Unconfigured native fallback.
- Deinitialize.
- Reinitialize after deinitialization.
- Interrupted deinitialization recovery.
- Interrupted route reconciliation recovery.
- Modified managed-file refusal.
- Filesystem collision refusal.

### Cross-platform

Tests must pass on:

- Ubuntu.
- macOS.
- Native Windows.

Pay particular attention to:

- Windows `.exe`/`.shim` launcher pairs.
- Case-insensitive command names on Windows.
- Shell activation.
- PATH resolution.
- Windows filesystem rename behavior.

Interactive tests should use simulated terminal input where practical.

Retain the existing real-TTY smoke-test checklist for manual verification.

## 13. Acceptance criteria

The milestone is accepted when:

- [ ] `arch init` provides an interactive wizard in a TTY.
- [ ] Explicit `arch init <commands...>` remains non-interactive.
- [ ] Existing installations can be reconfigured.
- [ ] Routes can be added and removed independently.
- [ ] `arch route list` reports the effective configured route set.
- [ ] `arch status` reports installation health.
- [ ] `arch deinit` safely removes owned routing resources.
- [ ] `arch uninstall` remains compatible.
- [ ] User-modified middleware configuration survives route changes.
- [ ] Interrupted mutations are recoverable.
- [ ] Native fallback remains functional.
- [ ] Existing Core and middleware contracts remain unchanged.
- [ ] All existing tests continue to pass.
- [ ] New tests pass across the supported CI matrix.
- [ ] README and architecture documentation are updated.

## 14. Implementation process

Proceed in two stages.

### Stage A — Design review

Before changing code:

1. Inspect the current implementation.
2. Identify reusable setup/uninstall primitives.
3. Propose the CLI command structure.
4. Define installation states.
5. Design safe routing reconciliation.
6. Define recovery semantics.
7. Identify compatibility risks.
8. Identify tests needed before implementation.

Write:

`docs/research/m2-routing-lifecycle-design.md`

Include:

- Proposed architecture.
- State transitions.
- Mutation and recovery strategy.
- CLI UX.
- Filesystem ownership implications.
- Rejected alternatives.
- Risks and trade-offs.

Do not modify production code during Stage A.

### Stage B — Implementation

After design approval:

1. Implement deterministic lifecycle services.
2. Add route reconciliation.
3. Add status and diagnostics.
4. Add CLI discovery.
5. Add interactive wizard.
6. Add deinitialization flow.
7. Add tests.
8. Update documentation.
9. Run the full validation matrix.

Do not expand scope into RTK or other modules.

## 15. Final deliverables

- Working setup wizard.
- Working routing management.
- Safe deinitialization.
- Backward-compatible CLI.
- Updated automated tests.
- Updated documentation.
- Implementation report with evidence.
- Explicit GO / CONDITIONAL GO / NO-GO recommendation.

**Success means that Arch can be installed, inspected, reconfigured, and removed without requiring users to manually manipulate generated files or understand the internal routing implementation.**