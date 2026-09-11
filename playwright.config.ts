import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Remote disposable databases can legitimately add a few seconds to the
  // first authenticated Server Action while their compute wakes. Keep the
  // assertions strict, but do not make cloud acceptance depend on LAN latency.
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    timeout: 180 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=',
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://dummy:dummy@localhost:5432/dummy',
      NEXT_OUTPUT: 'server',
      NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN: process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN || 'WEBMCP_ORIGIN_TRIAL_DUMMY_TOKEN_FOR_E2E',
    }
  },
});
