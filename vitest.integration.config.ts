import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Integration tests hit the real backend. They run in a node environment
// (no jsdom/localStorage) and are excluded from the default `bun run test`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/test/integration/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    css: false,
  },
});
