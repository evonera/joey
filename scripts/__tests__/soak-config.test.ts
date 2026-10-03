import { afterEach, expect, test, vi } from 'vitest';

vi.mock('@playwright/test', () => ({
  defineConfig: (config: unknown) => config,
  devices: { 'Desktop Chrome': {} },
}));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

test('remote soak keeps the real toolbar without sending a global header to telemetry', async () => {
  vi.stubEnv('JOEY_SOAK_BASE_URL', 'https://owned-fixture.vercel.app');
  vi.resetModules();
  const { default: config } = await import('../../playwright.soak.config');
  expect(config.use?.baseURL).toBe('https://owned-fixture.vercel.app');
  expect(config.use).not.toHaveProperty('extraHTTPHeaders');
  expect(config.webServer).toBeUndefined();
  expect(config.retries).toBe(0);
});

test('fresh local soak builds Eve before Next and the supervised launcher', async () => {
  vi.stubEnv('JOEY_SOAK_BASE_URL', '');
  vi.resetModules();
  const { default: config } = await import('../../playwright.soak.config');
  expect(config.webServer).toMatchObject({ command: 'npm run build:eve && npm run build && npm run start' });
  expect(config.use).not.toHaveProperty('extraHTTPHeaders');
});
