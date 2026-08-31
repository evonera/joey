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

test('all tenant dashboard surfaces redirect unauthenticated users', async ({ page }) => {
  for (const path of ['/flows', '/engagement', '/notifications', '/operations']) {
    await page.goto(path);
    await page.waitForURL('**/login*');
  }
});
