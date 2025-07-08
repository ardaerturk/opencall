import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/mls/__tests__/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/wasm/**'],
  },
});