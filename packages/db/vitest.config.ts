import { defineConfig } from 'vitest/config';

// Integration tests require PostgreSQL and run only through test:int.
export default defineConfig({
  test: { include: ['test/unit/**/*.test.ts'], passWithNoTests: true },
});
