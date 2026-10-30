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
        'src/core/index.ts': { lines: 95, branches: 90 },
        'src/core/execution-session.ts': { lines: 95, branches: 90 },
        'src/core/execution-environment.ts': { lines: 95, branches: 90 },
        'src/core/execution-failures.ts': { lines: 95, branches: 90 },
        'src/events.ts': { lines: 95, branches: 90 },
        'src/middleware.ts': { lines: 95, branches: 90 },
        'src/lifecycle/manifest.ts': { lines: 95, branches: 90 },
        'src/lifecycle/ownership.ts': { lines: 95, branches: 90 },
        'src/lifecycle/routing-journal.ts': { lines: 95, branches: 90 },
        'src/lifecycle/recovery-validation.ts': { lines: 95, branches: 90 },
        'src/process/native-environment.ts': { lines: 95, branches: 90 },
        'src/process/executable-resolver.ts': { lines: 95, branches: 90 },
        'src/process/windows-npm-shim.ts': { lines: 95, branches: 90 },
        'src/process/launch.ts': { lines: 95, branches: 90 },
        'src/process/child-lifecycle.ts': { lines: 95, branches: 90 },
      },
    },
  },
});
