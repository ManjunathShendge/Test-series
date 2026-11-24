import { defineConfig, devices } from '@playwright/test';

// Started by test/e2e/run.mjs (pnpm test:browser), which provides the servers and accounts.
export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env['E2E_BASE_URL'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
});
