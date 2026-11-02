#!/usr/bin/env node
import { compatibleRuntime } from './runtime-version.js';

// Do not statically import the harness under an unsupported project Node.
if (!compatibleRuntime(process.versions.node)) {
  console.error(
    '[arch bootstrap] Arch requires Node >=24.15.0 <25; use the stable entrypoint with an absolute ARCH_NODE without changing project PATH',
  );
  process.exitCode = 1;
} else {
  await import('./cli/main.js');
}
