import { test, expect } from '@playwright/test';

test('unauthenticated users are redirected to login', async ({ page }) => {
  await page.goto('/dashboard');

  await page.waitForURL('**/login*');

  await expect(page.locator('h2')).toContainText('Sign in to Joey');
});

test('dashboard sub-routes also redirect to login', async ({ page }) => {
  await page.goto('/drafts');
  await page.waitForURL('**/login*');
  await expect(page.locator('h2')).toContainText('Sign in to Joey');
});

test('authenticated users visiting login are redirected to dashboard', async ({ page }) => {

});
