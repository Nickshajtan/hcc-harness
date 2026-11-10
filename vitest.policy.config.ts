import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/unit/policy.test.ts',
      'tests/unit/policy-hardening.test.ts',
      'tests/unit/policy-deadline.test.ts',
      'tests/unit/policy-cleanup.test.ts',
      'tests/unit/mock-transport.test.ts',
      'tests/unit/mock-provider.test.ts',
    ],
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      include: [
        'src/policy.ts',
        'src/policy-deadline.ts',
        'src/mock-provider.ts',
        'src/mock-transport.ts',
      ],
      reportsDirectory: 'coverage/policy',
      reporter: ['text', 'json', 'json-summary'],
      thresholds: { perFile: true, lines: 95, branches: 90 },
    },
  },
});
