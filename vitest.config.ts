import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  resolve: {
    conditions: ['import', 'module', 'browser', 'default'],
  },
});