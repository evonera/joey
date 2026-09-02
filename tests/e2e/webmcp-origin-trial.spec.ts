import { test, expect } from '@playwright/test';

test('origin-trial meta tag is emitted when NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN is set', async ({ page }) => {
  await page.goto('/');

  const meta = page.locator('meta[http-equiv="origin-trial"]');
  await expect(meta).toHaveCount(1);
  await expect(meta).toHaveAttribute('content', 'WEBMCP_ORIGIN_TRIAL_DUMMY_TOKEN_FOR_E2E');
});

test('plain Chromium without an origin trial exposes no document.modelContext', async ({ page }) => {
  await page.goto('/');

  const hasModelContext = await page.evaluate(() => 'modelContext' in document);
  expect(hasModelContext).toBe(false);
});

test('no tools are registered on public pages, even when a modelContext exists', async ({ page }) => {
  await page.addInitScript(() => {
    const toolMap = new Map<string, unknown>();
    const registered: string[] = [];
    const modelContext = {
      registerTool: async (tool: unknown, options?: { signal?: AbortSignal }) => {
        const name = (tool as { name: string }).name;
        if (toolMap.has(name)) throw new DOMException('Tool already registered', 'InvalidStateError');
        toolMap.set(name, tool);
        registered.push(name);
        if (options?.signal) {
          options.signal.addEventListener('abort', () => toolMap.delete(name), { once: true });
        }
      },
      getTools: async () => Array.from(toolMap.values()),
      executeTool: async () => '',
      addEventListener: () => undefined,
    };
    Object.defineProperty(document, 'modelContext', { value: modelContext, configurable: true });
    Object.defineProperty(window, '__webmcpRegisteredNames', {
      get: () => registered,
      configurable: true,
    });
  });

  await page.goto('/');
  await page.goto('/login');
  await page.waitForURL('**/login*');

  const registered = await page.evaluate(() => (window as unknown as { __webmcpRegisteredNames?: string[] }).__webmcpRegisteredNames ?? []);
  expect(registered).toEqual([]);
});
