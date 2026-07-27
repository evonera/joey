import { test, expect } from '@playwright/test';

test('visiting unknown route shows 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');

  expect(response?.status()).toBe(404);

  await expect(page.locator('text=404')).toBeVisible();
});
