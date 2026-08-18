import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'], // Path to your setup file
    environment: 'jsdom', // Use jsdom environment for DOM APIs
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
