import { defineConfig } from 'vitest/config';

// Real filesystem effects and the native publication contract; no CLI or PTY.
export default defineConfig({
  test: {
    // Match ordinary integration budgets for native compilation/child barriers.
    testTimeout: 120_000,
    include: [
      'tests/unit/lifecycle-effects.test.ts',
      'tests/unit/lifecycle.test.ts',
      'tests/unit/lifecycle-contract.test.ts',
      'tests/unit/setup-contract.test.ts',
      'tests/unit/native-publication-state.test.ts',
      'tests/unit/publication-resource.test.ts',
      'tests/unit/publication-process.test.ts',
      'tests/integration/native-publication.test.ts',
      'tests/unit/uninstall.test.ts',
    ],
    maxWorkers: 1,
  },
});
