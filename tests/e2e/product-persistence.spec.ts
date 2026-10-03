import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type TestInfo } from '@playwright/test';
import { requireDisposableDatabase } from '../integration/require-disposable-database';

test.beforeAll(() => requireDisposableDatabase());

async function signup(context: BrowserContext, testInfo: TestInfo) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const response = await context.request.post('/api/auth/sign-up/email', {
    headers: { origin: testInfo.project.use.baseURL as string, 'x-forwarded-for': `2001:db8:${suffix.slice(0, 4)}:${suffix.slice(4)}::1` },
    data: { name: 'Persistence E2E', email: `persistence-${randomUUID()}@example.test`, password: 'Local-E2E-Only-2026!' },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

// Account-free paths deliberately exercise real saved state without creating
// credentials, invoking a model or publishing to a social provider.
for (const width of [1440, 390]) {
  test(`Compose saves and reopens the same account-free draft at ${width}px`, async ({ page, context }, testInfo) => {
    test.setTimeout(150_000);
    await signup(context, testInfo);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/compose');
    await expect(page.locator('.animate-spin:visible')).toHaveCount(0, { timeout: 60_000 });
    const initial = `Persistent manual draft ${randomUUID()}`;
    await page.getByRole('textbox', { name: 'Post content' }).fill(initial);
    await page.getByRole('button', { name: 'Save as Draft', exact: true }).click();
    await expect(page).toHaveURL(/\/drafts\?tab=draft$/);
    await expect(page.getByText(initial, { exact: true })).toBeVisible();
    const edit = page.getByRole('link', { name: 'Continue editing', exact: true });
    await expect(edit).toHaveCount(1);
    const href = await edit.getAttribute('href');
    expect(href).toMatch(/^\/compose\?draftId=[0-9a-f-]{36}$/);
    await edit.click();
    await expect(page.getByRole('textbox', { name: 'Post content' })).toHaveValue(initial);
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Post content' })).toHaveValue(initial);
    const revised = `${initial} edited`;
    await page.getByRole('textbox', { name: 'Post content' }).fill(revised);
    await page.getByRole('button', { name: 'Save as Draft', exact: true }).click();
    await expect(page).toHaveURL(/\/drafts\?tab=draft$/);
    await expect(page.getByText(revised, { exact: true })).toBeVisible();
    await expect(edit).toHaveCount(1);
    await expect(edit).toHaveAttribute('href', href!);
    await page.reload();
    await expect(page.getByText(revised, { exact: true })).toBeVisible();
    await expect(edit).toHaveCount(1);
    const screenshot = testInfo.outputPath(`persisted-draft-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('persisted-draft', { path: screenshot, contentType: 'image/png' });
  });
}

test('guided onboarding tour resumes its server checkpoint after refresh and pause', async ({ page, context }, testInfo) => {
  test.setTimeout(150_000);
  await signup(context, testInfo);
  await page.goto('/dashboard?tour=1');
  const tour = page.getByRole('dialog', { name: 'Joey product tour' });
  await expect(tour.getByText('Step 1 of 6', { exact: true })).toBeVisible();
  // ?tour=1 requests an explicit restart. Wait for the router to remove it
  // before refreshing, and wait for this checkpoint rather than an unrelated
  // background Server Action response from the chat workspace.
  await expect(page).toHaveURL(/\/dashboard$/);
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && Boolean(response.request().headers()['next-action']) && Boolean(response.request().postData()?.includes('"currentStep":1')) && Boolean(response.request().postData()?.includes('"status":"in_progress"'))),
    tour.getByRole('button', { name: 'Next', exact: true }).click(),
  ]);
  await expect(tour.getByText('Step 2 of 6', { exact: true })).toBeVisible();
  await page.reload();
  await expect(tour.getByText('Step 2 of 6', { exact: true })).toBeVisible();
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && Boolean(response.request().headers()['next-action']) && Boolean(response.request().postData()?.includes('"status":"dismissed"'))),
    tour.getByRole('button', { name: 'Pause tour', exact: true }).click(),
  ]);
  await page.reload();
  await expect(tour).toHaveCount(0);
  await page.getByRole('button', { name: 'Help & Tutorial Guide', exact: true }).click();
  await page.getByRole('button', { name: 'Resume interactive tour at step 2', exact: true }).click();
  await expect(tour.getByText('Step 2 of 6', { exact: true })).toBeVisible();
  await expect(tour.getByRole('heading', { name: 'Choose publishing accounts', exact: true })).toBeVisible();
  const screenshot = testInfo.outputPath('resumed-tour.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('resumed-tour', { path: screenshot, contentType: 'image/png' });
});
