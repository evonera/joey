import { test, expect } from '@playwright/test';

test('landing page loads successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toContainText('Autonomous social media');

  const heroCta = page.locator('text=Start Automating Free');
  await expect(heroCta).toBeVisible();

  await expect(page.locator('a[href="/login"]')).toBeVisible();
  await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
});

test('landing page has feature cards', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('text=Visual Flows')).toBeVisible();
  await expect(page.locator('text=Theme Studio')).toBeVisible();
  await expect(page.locator('text=BYOK Agent Chat')).toBeVisible();
  await expect(page.locator('text=1-Tap Telegram Approvals')).toBeVisible();
});

test('clicking hero CTA navigates to signup', async ({ page }) => {
  await page.goto('/');

  await page.locator('text=Start Automating Free').click();
  await page.waitForURL('**/signup');
  await expect(page.locator('h1')).toContainText('Create your Joey Workspace');
});

test('clicking Log in navigates to login', async ({ page }) => {
  await page.goto('/');

  await page.locator('a[href="/login"]').click();
  await page.waitForURL('**/login');
  await expect(page.locator('h1')).toContainText('Welcome to Joey');
});
