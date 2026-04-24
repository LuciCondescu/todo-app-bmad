import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  // E2E specs share a single docker Postgres; each test's beforeEach runs
  // TRUNCATE TABLE todos. Parallel workers would race against each other's
  // truncates, so serialize everything onto one worker.
  workers: 1,
  // Retry locally on flaky test-isolation failures caused by zombie POSTs
  // committing server-side after a prior test's page tore down. The double-
  // truncate in beforeEach catches most cases; retry absorbs the rest.
  retries: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Disable HTTP caching for all API requests so each test sees the post-truncate
    // DB state instead of a cached list from a previous test's page lifecycle.
    extraHTTPHeaders: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  },
  webServer: [
    {
      command: 'npm run dev --workspace apps/api',
      cwd: '../..',
      url: 'http://localhost:3000/healthz',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run preview --workspace apps/web',
      cwd: '../..',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
