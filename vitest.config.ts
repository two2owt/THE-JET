import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'], // Path to your setup file
    environment: 'jsdom', // Use jsdom environment for DOM APIs
  },
});
