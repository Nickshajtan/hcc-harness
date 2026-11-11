# ADR-009: Isolated Windows PTY test drivers

## Status

Accepted test-infrastructure decision; PR #26 merged `9d32f64`. Recorded 2026-11-11.

## Context

Windows node-pty 1.1.0 can emit PTY exit while driver handles/workers remain alive. Native-only reproduction showed the same issue; shell exit alone does not establish complete driver cleanup.

## Decision

Use one dedicated Windows process per test PTY with public APIs. Report the session result, receive parent release acknowledgement, then explicitly exit the driver. Parent verifies driver close/status and identity-based captured helper settlement. This is not an Arch production process feature.

## Consequences

Supervising test runners exit naturally. Normal cleanup avoids parent-forced termination and private-field access. Forced driver recovery is a failing negative-control path, not success. CIM visibility and non-detaching fixtures limit observed ownership.

## Considered alternatives

Public onExit/listener disposal alone failed to release native resources. Post-exit kill produced upstream diagnostics/fallback delays. A version-pinned private adapter was historically explored but superseded by process-boundary disposal; upgrading/replacing node-pty was not required.

## Evidence and implementation references

[Windows PTY helper](../../scripts/windows-pty.mjs), [driver](../../scripts/pty-driver.mjs), [hardening evidence](../validation/windows-pty-cleanup-hardening.md), [historical private adapter](../validation/windows-pty-lifecycle.md), [PR #26](https://github.com/Nickshajtan/hcc-harness/pull/26).

## Date and revision

The date above records consolidation or a reliably identified implementation revision,
not an invented historical approval meeting. See the linked original evidence.
