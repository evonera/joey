import { test, expect } from '@playwright/test';

test('signup page loads successfully', async ({ page }) => {
  await page.goto('/signup');

  await expect(page.locator('h2')).toContainText('Create your account');

  await expect(page.locator('text=Join Joey to automate your social media')).toBeVisible();

  await expect(page.locator('input[type="text"][required]')).toBeVisible();
  await expect(page.locator('input[type="email"][required]')).toBeVisible();
  await expect(page.locator('input[type="password"][required]')).toBeVisible();

  await expect(page.locator('button[type="submit"]')).toContainText('Sign up');
});


