import { beforeEach, expect, test, vi } from 'vitest';
import type { Page } from '@playwright/test';
import { navigateWithinApp, waitForSettledRoute } from '../../tests/performance/navigation';

const assertions = vi.hoisted(() => ({ hidden: vi.fn(), visible: vi.fn(), enabled: vi.fn(), count: vi.fn(), notLoading: vi.fn() }));
vi.mock('@playwright/test', () => ({
  expect: () => ({ toBeHidden: assertions.hidden, toBeVisible: assertions.visible, toBeEnabled: assertions.enabled, toHaveCount: assertions.count, not: { toContainText: assertions.notLoading } }),
}));
beforeEach(() => vi.clearAllMocks());

function pageFixture(present: boolean, initiallyVisible: boolean) {
  let visible = initiallyVisible;
  const menuClick = vi.fn(async () => { visible = true; });
  const linkClick = vi.fn(async () => undefined);
  const goto = vi.fn(async () => undefined);
  const waitForURL = vi.fn(async () => undefined);
  const page = {
    locator: (selector: string) => {
      const value = selector.startsWith('details:')
        ? { count: async () => Number(present && !visible), locator: () => ({ click: menuClick }) }
        : { count: async () => Number(present && (!selector.endsWith(':visible') || visible)), isVisible: async () => visible, click: linkClick };
      return { first: () => value };
    },
    goto, waitForURL, waitForLoadState: vi.fn(async () => undefined),
    getByRole: vi.fn(() => ({})),
    getByText: vi.fn(() => ({})),
  };
  return { page: page as unknown as Page, menuClick, linkClick, goto, waitForURL };
}

test('opens an existing collapsed menu and uses its link without a document reload', async () => {
  const fixture = pageFixture(true, false);
  await navigateWithinApp(fixture.page, '/compose');
  expect(fixture.menuClick).toHaveBeenCalledOnce();
  expect(fixture.linkClick).toHaveBeenCalledOnce();
  expect(fixture.goto).not.toHaveBeenCalled();
  expect(fixture.waitForURL).toHaveBeenCalledOnce();
});
test('uses an already-visible link without toggling its menu', async () => {
  const fixture = pageFixture(true, true);
  await navigateWithinApp(fixture.page, '/drafts');
  expect(fixture.linkClick).toHaveBeenCalledOnce();
  expect(fixture.menuClick).not.toHaveBeenCalled();
  expect(fixture.goto).not.toHaveBeenCalled();
});
test('retains document navigation for a genuine custom route absent from navigation', async () => {
  const fixture = pageFixture(false, false);
  await navigateWithinApp(fixture.page, '/custom-fixture');
  expect(fixture.goto).toHaveBeenCalledWith('/custom-fixture', { waitUntil: 'domcontentloaded' });
  expect(fixture.linkClick).not.toHaveBeenCalled();
});
test('settles the streamed route and workspace hydration without raising the five-second budget', async () => {
  const fixture = pageFixture(true, true);
  await waitForSettledRoute(fixture.page, '/drafts');
  expect(assertions.hidden).toHaveBeenCalledWith({ timeout: 5_000 });
  expect(assertions.visible).toHaveBeenCalledWith({ timeout: 5_000 });
  expect(assertions.notLoading).toHaveBeenCalledWith('Loading...', { timeout: 5_000 });
  expect(fixture.page.getByRole).toHaveBeenCalledWith('textbox', { name: 'Search drafts by content or title', exact: true });
  expect(assertions.count).toHaveBeenCalledWith(0, { timeout: 5_000 });
});
test('checks the dashboard composer rather than requiring a heading absent from active chats', async () => {
  const fixture = pageFixture(true, true);
  await waitForSettledRoute(fixture.page, '/dashboard');
  expect(fixture.page.getByRole).toHaveBeenCalledWith('textbox', { name: 'Ask Joey to research topics, draft posts, or automate flows', exact: true });
  expect(fixture.page.getByRole).not.toHaveBeenCalledWith('heading', expect.anything());
});
test('rejects an unknown authenticated route rather than assuming its heading proves readiness', async () => {
  const fixture = pageFixture(true, true);
  await expect(waitForSettledRoute(fixture.page, '/custom-fixture')).rejects.toThrow('No authenticated soak readiness check');
});
