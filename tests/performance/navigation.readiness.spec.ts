import { expect, test } from '@playwright/test';
import { waitForSettledRoute } from './navigation';

// Real browser DOM assertions, isolated from the app, DB and providers.
test('flow heading cannot hide an unfinished client load', async ({ page }) => {
  await page.setContent('<button aria-label="Switch workspace">Fixture workspace</button><h1>Flows</h1><p>Loading…</p>');
  await expect(waitForSettledRoute(page, '/flows')).rejects.toThrow('toBeHidden');
  await page.getByText('Loading…', { exact: true }).evaluate(node => node.remove());
  await waitForSettledRoute(page, '/flows');
});

test('dashboard conversation is ready with its composer and no heading', async ({ page }) => {
  await page.setContent('<button aria-label="Switch workspace">Fixture workspace</button><textarea aria-label="Ask Joey to research topics, draft posts, or automate flows"></textarea>');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
  await waitForSettledRoute(page, '/dashboard');
});
