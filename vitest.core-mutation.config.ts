import { defineConfig } from 'vitest/config';

// Real native execution remains in Core tests; no CLI or terminal bootstrap is needed.
export default defineConfig({
  test: {
    include: [
      'tests/unit/core.test.ts',
      'tests/unit/execution-policy.test.ts',
      'tests/unit/environment.test.ts',
      'tests/unit/events.test.ts',
    ],
    maxWorkers: 1,
  },
});
