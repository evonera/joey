import { expect, type Page } from '@playwright/test';

export async function navigateWithinApp(page: Page, route: string) {
  // A collapsed workspace menu still contains real Next links. Open it as a
  // user would instead of turning every visit into a fresh document load.
  const existingLink = page.locator(`a[href="${route}"]`).first();
  if (await existingLink.count() && !await existingLink.isVisible()) {
    const menu = page.locator(`details:has(a[href="${route}"])`).first();
    if (await menu.count()) await menu.locator('summary').click();
  }
  const link = page.locator(`a[href="${route}"]:visible`).first();
  if (await link.count()) {
    await link.click();
    await page.waitForURL(url => url.pathname === route, { timeout: 15_000, waitUntil: 'domcontentloaded' });
  } else {
    // Custom routes not present in navigation still exercise document loads.
    await page.goto(route, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForLoadState('domcontentloaded');
}

export async function waitForSettledRoute(page: Page, route: string) {
  // URL/DOMContentLoaded can precede the streamed route and client hydration.
  // Do not record a loading-shell baseline as if the app were warmed.
  await expect(page.getByRole('status', { name: 'Loading page' })).toBeHidden({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: 'Switch workspace' })).not.toContainText('Loading...', { timeout: 5_000 });
  // Headings alone are not readiness: dashboard conversations have no h1,
  // while client pages can render their heading before their data arrives.
  const textboxes: Record<string, string> = {
    '/dashboard': 'Ask Joey to research topics, draft posts, or automate flows',
    '/agents': 'Search agents',
    '/compose': 'Post content',
    '/drafts': 'Search drafts by content or title',
    '/engagement': 'Search people or messages',
  };
  const textbox = textboxes[route];
  if (textbox) {
    await expect(page.getByRole('textbox', { name: textbox, exact: true })).toBeVisible({ timeout: 5_000 });
  } else if (route === '/calendar') {
    await expect(page.getByRole('button', { name: 'Next period', exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Next period', exact: true })).toBeEnabled({ timeout: 5_000 });
  } else {
    const headings: Record<string, string> = {
      '/flows': 'Flows', '/theme-studio': 'Theme Studio', '/analytics': 'Analytics',
      '/accounts': 'Connected Accounts', '/settings': 'Settings',
    };
    const heading = headings[route];
    if (!heading) throw new Error(`No authenticated soak readiness check is defined for ${route}.`);
    await expect(page.getByRole('heading', { name: heading, level: 1, exact: true })).toBeVisible({ timeout: 5_000 });
  }
  // Existing client loaders have no shared accessible status, so also check
  // their actual rendered loading states, not merely their surrounding shell.
  await expect(page.locator('svg.animate-spin:visible')).toHaveCount(0, { timeout: 5_000 });
  if (route === '/flows') await expect(page.getByText('Loading…', { exact: true })).toBeHidden({ timeout: 5_000 });
  if (route === '/drafts') await expect(page.getByText('Loading drafts...', { exact: true })).toBeHidden({ timeout: 5_000 });
  if (route === '/agents') await expect(page.getByText('Loading runs…', { exact: true })).toBeHidden({ timeout: 5_000 });
  if (route === '/calendar') await expect(page.locator('.rbc-calendar [data-slot="skeleton"]:visible')).toHaveCount(0, { timeout: 5_000 });
}
