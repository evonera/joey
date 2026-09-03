import { test, expect } from '@playwright/test';

test('signup page loads successfully', async ({ page }) => {
  await page.goto('/signup');

  await expect(page.locator('h1')).toContainText('Create your Joey Workspace');

  await expect(page.locator('text=Start automating your social brand')).toBeVisible();

  await expect(page.locator('input[type="text"][required]')).toBeVisible();
  await expect(page.locator('input[type="email"][required]')).toBeVisible();
  await expect(page.locator('input[type="password"][required]')).toBeVisible();

  await expect(page.locator('button[type="submit"]')).toContainText('Create Workspace');
});


