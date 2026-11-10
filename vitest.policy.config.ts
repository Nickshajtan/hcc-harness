import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/policy.test.ts', 'tests/unit/mock-provider.test.ts'],
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      include: ['src/policy.ts', 'src/mock-provider.ts'],
      reportsDirectory: 'coverage/policy',
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { perFile: true, lines: 95, branches: 90 },
    },
  },
});
