import { test, expect } from '@playwright/test';

test('login page loads successfully', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('h1')).toContainText('Welcome to Joey');

  await expect(page.locator('text=Autonomous social media agent')).toBeVisible();

  await expect(page.locator('input[type="email"][required]')).toBeVisible();
  await expect(page.locator('input[type="password"][required]')).toBeVisible();

  await expect(page.locator('button[type="submit"]')).toContainText(/sign in/i);
});

test('login page shows error on invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('nobody@example.com');
  await page.locator('input[type="password"]').fill('incorrect-password');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.text-red-400')).toBeVisible();
});
