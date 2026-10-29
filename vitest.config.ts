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
    },
  },
});
