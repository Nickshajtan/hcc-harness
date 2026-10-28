# Filesystem compatibility

M2 routing reconciliation (`configure`, `route add`, `route remove`) publishes
complete staged files using exclusive hard links. Existing destination files are
never overwritten by publication. Owned manifest replacement continues to use a
same-directory staged rename. The M1/M2 manifest formats are unchanged.

exFAT lacks the required hard-link capability and is consciously unsupported for
reconciliation. Other filesystems, network mounts, permissions, or configurations
can prevent hard links too. Arch checks the actual operation; it does not infer
support from an OS or filesystem label. Prefer a local NTFS, APFS, or ext4 filesystem
where hard links are supported and configured appropriately.

Initial M1-style `arch init` and ordinary `arch deinit --yes` use no hard-link
publication. An unchanged desired route set also needs no publication. A pending
routing journal is different: deinit first completes its recorded reconciliation,
which can require hard links. CLI installation through npm is independent of these
project routing operations.

Publication errors identify the target and OS error code, explain the hard-link
requirement, and recommend checking collisions and permissions as well as filesystem
capability. They do not imply every EPERM error proves an unsupported filesystem.
No copy, exclusive-write, or other fallback is attempted.

If initial journal publication fails, existing routes and the ownership manifest
remain unchanged; an unreferenced `.arch/routing.stage` may remain. Inspect it and
move it aside before retrying. If a later publication fails, retain the journal
and staged files. Run `arch status --json`; retry `arch configure` with the recorded
desired commands once capability/permissions are restored. Do not delete or edit
ownership evidence to bypass checks. Published additions may remain after a later
failure; updates are recoverable, not an atomic route-set switch. Ownership,
collision, partial-stage, and interruption checks continue to apply.

Deterministic tests inject unsupported-capability errors and verify unchanged
owned/unrelated files, no fallback, and ordinary setup/removal without links.
Real supported publication, collisions, manifest replacement and subprocess
interruption recovery remain covered by the existing suites. CI does not require
or claim testing a real exFAT volume; see the M2.1 implementation report for evidence.
