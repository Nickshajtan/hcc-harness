import { defineConfig } from 'vitest/config';

// Focused critical-domain pilot: configuration validation and fail-closed discovery.
export default defineConfig({
  test: { include: ['tests/unit/config.test.ts'], maxWorkers: 1 },
});
