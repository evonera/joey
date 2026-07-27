import { test, expect } from '@playwright/test';

test('landing page loads successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toContainText('Autonomous Social Media, Solved.');

  const heroCta = page.locator('text=Start Automating');
  await expect(heroCta).toBeVisible();

  await expect(page.locator('a[href="/login"]')).toBeVisible();
  await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
});

test('landing page has feature cards', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('text=Eve-Powered AI')).toBeVisible();
  await expect(page.locator('text=Human in the Loop')).toBeVisible();
  await expect(page.locator('text=Smart Scheduling')).toBeVisible();
  await expect(page.locator('text=Cross-Platform Sync')).toBeVisible();
});

test('clicking hero CTA navigates to signup', async ({ page }) => {
  await page.goto('/');

  await page.locator('text=Start Automating').click();
  await page.waitForURL('**/signup');
  await expect(page.locator('h2')).toContainText('Create your account');
});

test('clicking Log in navigates to login', async ({ page }) => {
  await page.goto('/');

  await page.locator('a[href="/login"]').click();
  await page.waitForURL('**/login');
  await expect(page.locator('h2')).toContainText('Sign in to Joey');
});
