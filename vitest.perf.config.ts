import { defineConfig } from 'vitest/config';

/**
 * Performance and benchmark suites. These assert on wall-clock time and are
 * therefore excluded from the default `npm test`; run them locally with
 * `npm run test:perf` on a quiet machine.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/performance/**/*.test.ts',
      'tests/benchmarks/**/*.test.ts',
    ],
    fileParallelism: false,
  },
});
