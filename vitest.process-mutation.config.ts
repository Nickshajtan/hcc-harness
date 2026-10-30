import { defineConfig } from 'vitest/config';

// Controlled child events and real isolated filesystem decisions; native console
// and runtime execution stay in the unchanged integration/portability suites.
export default defineConfig({
  test: {
    include: [
      'tests/unit/process.test.ts',
      'tests/unit/resolution.test.ts',
      'tests/unit/npm-shim.test.ts',
      'tests/unit/process-policy.test.ts',
      'tests/unit/process-failures.test.ts',
    ],
    maxWorkers: 1,
  },
});
