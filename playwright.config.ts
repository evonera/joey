import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.JOEY_E2E_PORT || 3000);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('JOEY_E2E_PORT must be a port between 1024 and 65535.');
const baseURL = `http://localhost:${port}`;
// Explicit opt-in for an already-managed loopback-only Docker/test server.
// Mutating cases still require their disposable-database guard.
const managedLocalServer = process.env.JOEY_E2E_MANAGED_LOCAL_SERVER === 'true';
if (managedLocalServer && (process.env.JOEY_INTEGRATION_TEST !== 'true' || !process.env.DATABASE_URL)) {
  throw new Error('Managed local acceptance requires JOEY_INTEGRATION_TEST=true and an explicit disposable DATABASE_URL.');
}

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
  reporter: process.env.CI ? 'line' : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: managedLocalServer ? undefined : {
    command: `npm run build:eve && npm run build && npm run start -- --port ${port}`,
    url: baseURL,
    timeout: 180 * 1000,
    // Authenticated cases write data. Never reuse a local server whose DB
    // cannot be proven to match the disposable database checked by the suite.
    reuseExistingServer: false,
    env: {
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=',
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://dummy:dummy@localhost:5432/dummy',
      NEXT_OUTPUT: 'server',
      JOEY_E2E: '1',
      NEXT_PUBLIC_APP_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN: process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN || 'WEBMCP_ORIGIN_TRIAL_DUMMY_TOKEN_FOR_E2E',
    }
  },
});
