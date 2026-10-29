import { configDefaults, defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    maxWorkers: 2,
    // Stryker sandboxes are generated copies, never additional regression suites.
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Declarations contain no executable production behavior.
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Only these measured scopes have reached the critical targets.
      // Other production files remain included without a numeric gate.
      thresholds: {
        'src/config.ts': { lines: 95, branches: 90 },
        'src/core.ts': { lines: 95, branches: 90 },
        'src/execution-session.ts': { lines: 95, branches: 90 },
        'src/execution-environment.ts': { lines: 95, branches: 90 },
        'src/execution-failures.ts': { lines: 95, branches: 90 },
        'src/events.ts': { lines: 95, branches: 90 },
        'src/middleware.ts': { lines: 95, branches: 90 },
      },
    },
  },
});
