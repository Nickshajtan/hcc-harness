import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/unit/cli-policy.test.ts',
      'tests/unit/cli-dispatch.test.ts',
      'tests/unit/cli-run.test.ts',
      'tests/unit/wizard.test.ts',
    ],
    maxWorkers: 1,
  },
});
