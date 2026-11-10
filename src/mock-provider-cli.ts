#!/usr/bin/env node
import { runMockHook, mockProviderCapabilities } from './mock-provider.js';
import type { ArchMiddleware } from './middleware.js';

// Explicit demonstration only. Never added to the default registry or harness.toml.
const economyDelegation = (): ArchMiddleware => ({
  id: 'economy-delegation',
  register: () => undefined,
  registerPolicy(api) {
    api.on('agent.beforeSpawn', (request) => {
      if ('premium' === request.requestedModel) {
        return { action: 'deny', reason: 'Premium subagent requires approval' };
      }
      return { action: 'allow' };
    });
  },
});

try {
  process.exitCode = await runMockHook({
    input: process.stdin,
    output: process.stdout,
    diagnostics: process.stderr,
    capabilities: mockProviderCapabilities,
    policyOptions: {
      requiredPolicies: ['economy-delegation'],
      timeoutMs: 5000,
      cleanupGraceMs: 100,
    },
    configuration: { middleware: [{ id: 'economy-delegation', enabled: true }] },
    registry: new Map([['economy-delegation', economyDelegation]]),
  });
} catch {
  // stderr itself may be unavailable. A failed transport must never exit successfully.
  process.exitCode = 5;
} finally {
  // Only this executable owns its stdio. Library callers retain their own streams.
  process.stdin.destroy();
  if (5 === process.exitCode) {
    process.stdout.destroy();
    process.stderr.destroy();
  }
}
