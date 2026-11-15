import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for pure logic and stores. Native modules are replaced with
 * in-memory fakes under test/mocks so tests run in Node without a device.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'expo-sqlite/kv-store': fileURLToPath(new URL('./test/mocks/kv-store.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
  },
});
