import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'tests/unit/stable-install.test.ts',
      'tests/unit/stable-layout.test.ts',
      'tests/unit/stable-effects.test.ts',
    ],
    maxWorkers: 1,
    testTimeout: 15_000,
  },
});
