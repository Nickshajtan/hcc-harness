import { defineConfig } from 'vitest/config';

// Decision tests use real isolated filesystem resources without CLI/application startup.
export default defineConfig({
  test: {
    include: [
      'tests/unit/manifest.test.ts',
      'tests/unit/routing-journal.test.ts',
      'tests/unit/ownership.test.ts',
    ],
    maxWorkers: 1,
  },
});
