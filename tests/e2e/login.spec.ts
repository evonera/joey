import { test, expect } from '@playwright/test';

test('login page loads successfully', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('h2')).toContainText('Sign in to Joey');

  await expect(page.locator('text=Welcome back to your autonomous social media agent')).toBeVisible();

  await expect(page.locator('input[type="email"][required]')).toBeVisible();
  await expect(page.locator('input[type="password"][required]')).toBeVisible();

  await expect(page.locator('button[type="submit"]')).toContainText('Sign in');
});

test('login page redirects to dashboard on successful login', async ({ page }) => {

});

test('login page shows error on invalid credentials', async ({ page }) => {

});
