import { defineConfig } from 'vitest/config';

// Real filesystem effects with controlled failures; no CLI, PTY or native child cost.
export default defineConfig({
  test: {
    include: [
      'tests/unit/lifecycle-effects.test.ts',
      'tests/unit/lifecycle.test.ts',
      'tests/unit/lifecycle-contract.test.ts',
      'tests/unit/setup-contract.test.ts',
      'tests/unit/uninstall.test.ts',
    ],
    maxWorkers: 1,
  },
});
