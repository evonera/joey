import { randomUUID } from "node:crypto";
import { test, expect, type Page, type TestInfo } from "@playwright/test";

async function captureScreenshot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  // CI verifies every interaction and viewport; local QA keeps the 64-image gallery.
  if (!process.env.CI) await page.screenshot({ path: testInfo.outputPath(name), fullPage });
}

function signupHeaders(testInfo: TestInfo) {
  // Better Auth intentionally limits sign-up attempts to three per IP per
  // ten-second window. Give each test/retry its own documentation-range IPv6
  // address so retries test the application rather than the auth limiter.
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return { origin: testInfo.project.use.baseURL as string, "x-forwarded-for": `2001:db8::${suffix}` };
}

for (const width of [1440, 390, 320] as const) {
test(`authenticated workspace routes remain usable at ${width}px`, async ({ page, context }, testInfo) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signup = await context.request.post("/api/auth/sign-up/email", {
    headers: signupHeaders(testInfo),
    data: { name: "E2E Workspace", email: `workspace-${randomUUID()}@example.test`, password: "Local-E2E-Only-2026!" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  const routes = ["/dashboard", "/compose", "/drafts", "/calendar", "/flows", "/flows/templates", "/theme-studio", "/theme-studio/templates", "/assets", "/engagement", "/analytics", "/accounts", "/brandkit", "/settings", "/operations"];
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      if (process.env.CI) console.log(`Checking ${route} at ${width}px`);
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 60_000 });
      if (["/compose", "/calendar"].includes(route)) await expect(page.locator(".animate-spin:visible")).toHaveCount(0, { timeout: 60_000 });
      if (route === "/calendar") await expect(page.getByText("Loading posts…")).toHaveCount(0, { timeout: 60_000 });
      if (route === "/assets") await expect(page.locator(".animate-pulse:visible")).toHaveCount(0, { timeout: 60_000 });
      if (route === "/drafts") await expect(page.getByText("Loading drafts...")).toHaveCount(0, { timeout: 60_000 });
      if (route === "/flows") await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0, { timeout: 60_000 });
      if (route === "/flows/templates") await expect(page.getByText("Loading templates…")).toHaveCount(0, { timeout: 60_000 });
      if (route === "/analytics") await expect(page.locator(".animate-spin:visible")).toHaveCount(0, { timeout: 60_000 });
      if (route === "/analytics") await expect(page.getByRole("link", { name: "Connect account" })).toBeVisible();
      if (route === "/accounts") await expect(page.getByText("No accounts connected yet")).toBeVisible();
      await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} overflows at ${width}px`).toBe(true);
      if (route === "/calendar") {
        if (width >= 640) {
          await expect(page.locator(".rbc-month-view")).toBeVisible();
          expect(await page.locator(".rbc-month-row").first().evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(40);
        } else {
          await expect(page.getByLabel("Mobile post agenda")).toBeVisible();
          await expect(page.getByRole("button", { name: "Create post", exact: true })).toBeVisible();
        }
      }
      if (route === "/compose" && width === 320) {
        const publishNow = await page.getByRole("tab", { name: "Publish Now" }).boundingBox();
        const scheduleLater = await page.getByRole("tab", { name: "Schedule for Later" }).boundingBox();
        expect(publishNow).not.toBeNull();
        expect(scheduleLater).not.toBeNull();
        expect(publishNow!.y + publishNow!.height).toBeLessThanOrEqual(scheduleLater!.y);
        const timingCard = await page.locator('[data-slot="card"]').filter({ hasText: "Publish Timing" }).boundingBox();
        expect(timingCard).not.toBeNull();
        expect(scheduleLater!.y + scheduleLater!.height).toBeLessThan(timingCard!.y + timingCard!.height);
      }
      if (route === "/dashboard" && width <= 390) {
        const mic = await page.getByRole("button", { name: "Voice input" }).boundingBox();
        const submit = await page.getByRole("button", { name: "Submit" }).boundingBox();
        expect(mic).not.toBeNull();
        expect(submit).not.toBeNull();
        const overlap = mic!.x < submit!.x + submit!.width && mic!.x + mic!.width > submit!.x && mic!.y < submit!.y + submit!.height && mic!.y + mic!.height > submit!.y;
        expect(overlap, `Chat voice input and Submit overlap at ${width}px`).toBe(false);
      }
      await captureScreenshot(page, testInfo, `${route.slice(1).replaceAll("/", "-")}-${width}.png`);
    }
  expect(errors).toEqual([]);
  if (width === 320) {
  await page.goto("/dashboard?create=post");
  await expect(page.getByRole("button", { name: "Close sidepanel" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Details" })).toBeVisible();
  await expect(page.getByText("Loading your work…")).toHaveCount(0, { timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Chat creation panel overflows at 320px").toBe(true);
  await captureScreenshot(page, testInfo, "chat-create-post-320.png");
  await page.getByRole("button", { name: "Close sidepanel" }).click();
  await expect(page.getByRole("button", { name: "Create a post" })).toBeVisible();
  await page.goto("/compose");
  await page.waitForFunction(() => Object.keys(sessionStorage).some((key) => key.startsWith("joey:compose:")));
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((entry) => entry.startsWith("joey:compose:"));
    if (key) sessionStorage.setItem(key, JSON.stringify({ content: "Keep this restored draft", scheduleType: "now", scheduledDate: "2020-01-01" }));
  });
  await page.goto("/calendar?view=day");
  const requestedDate = "2030-01-12";
  await page.getByLabel("Post date").fill(requestedDate);
  await page.getByRole("button", { name: "Create post", exact: true }).click();
  await expect(page).toHaveURL(`/compose?date=${requestedDate}`);
  await expect(page.getByRole("tab", { name: "Schedule for Later" })).toHaveAttribute("data-state", "active");
  await expect(page.locator("#schedule-date")).toHaveValue(requestedDate);
  await expect(page.getByRole("textbox", { name: "Post content" })).toHaveValue("Keep this restored draft");
  }
});
}

test("a new workspace can create a theme page and open every setup tab", async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  const signup = await context.request.post("/api/auth/sign-up/email", {
    headers: signupHeaders(testInfo),
    data: { name: "Theme E2E", email: `theme-${randomUUID()}@example.test`, password: "Local-E2E-Only-2026!" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  await page.goto("/theme-studio/new");
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByPlaceholder("e.g. Cricket World Daily or Pubity Style Hub").fill("Astronomy Daily");
  await page.getByPlaceholder("e.g. Cricket news, match stats, viral sporting moments").fill("Astronomy and space exploration");
  for (let step = 0; step < 4; step++) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureScreenshot(page, testInfo, `theme-wizard-step-${step + 1}-320.png`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Theme wizard step ${step + 1} overflows at 320px`).toBe(true);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(page, testInfo, "theme-wizard-step-5-320.png");
  await page.getByRole("button", { name: "Create Theme Page", exact: true }).click();
  await expect(page).toHaveURL(/\/theme-studio\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const path = new URL(page.url()).pathname;
  for (const suffix of ["", "/sources", "/mix", "/templates", "/preview-day", "/settings"]) {
    expect((await page.goto(path + suffix))?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    if (suffix === "/settings") await expect(page.getByRole("heading", { name: "Theme Page Settings" })).toBeVisible();
    await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Theme section ${suffix || "overview"} overflows at 320px`).toBe(true);
    await captureScreenshot(page, testInfo, `theme${suffix.replaceAll("/", "-") || "-overview"}-320.png`);
  }
  await page.goto(`${path}/preview-day`);
  await page.getByRole("button", { name: "Show Sample Day" }).click();
  await expect(page.getByRole("group", { name: "Slide indicators" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Next slide" }).first().click();
  await expect(page.getByRole("button", { name: "Slide 2, current" }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Theme samples overflow at 320px").toBe(true);
  await captureScreenshot(page, testInfo, "theme-preview-samples-320.png");
  await page.goto(`${path}/templates`);
  const linkedTemplate = page.getByRole("link", { name: "Edit style" }).first();
  const linkedHref = await linkedTemplate.getAttribute("href");
  expect(linkedHref).toMatch(/\/theme-studio\/[0-9a-f-]{36}\/templates\/[0-9a-f-]{36}$/);
  const templateId = linkedHref!.split("/").at(-1)!;
  await page.goto(`${path}/settings`);
  await page.getByRole("button", { name: "Delete Page" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete Page" }).click();
  await expect(page).toHaveURL(/\/theme-studio$/);
  await page.goto("/theme-studio/templates");
  await expect(page.getByRole("link", { name: "Edit style" }).first()).toHaveAttribute("href", `/theme-studio/templates/${templateId}`);
  await page.goto(`/theme-studio/templates/${templateId}`);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/theme-studio\/templates$/, { timeout: 60_000 });
  await expect(page.locator(`a[href="/theme-studio/templates/${templateId}"]`)).toHaveCount(0);
});


test("Instagram and TikTok templates are available and install as editable flows", async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const signup = await context.request.post("/api/auth/sign-up/email", {
    headers: signupHeaders(testInfo),
    data: { name: "Template E2E", email: `templates-${randomUUID()}@example.test`, password: "Local-E2E-Only-2026!" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const name of ["Instagram Theme Image", "TikTok Video Caption"]) {
    await page.goto("/flows/templates");
    const heading = page.getByRole("heading", { name, exact: true });
    await expect(heading).toBeVisible();
    await page.getByRole("button", { name: `Install ${name} template`, exact: true }).click();
    await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Flow steps")).toBeVisible();
    await expect(page.getByText("Before you activate")).toBeVisible();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByRole("button", { name: "Activate" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} flow overflows at 320px`).toBe(true);
    await captureScreenshot(page, testInfo, `flow-${name.toLowerCase().replaceAll(" ", "-")}-320.png`);
    const draftStep = page.getByLabel("Flow steps").getByRole("button", { name: /Create Draft/ });
    await expect(draftStep).toBeVisible();
    await draftStep.click();
    await expect(page.getByRole("combobox", { name: "Publishing account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect a social account" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} settings overflow at 320px`).toBe(true);
    await captureScreenshot(page, testInfo, `flow-${name.toLowerCase().replaceAll(" ", "-")}-settings-320.png`);
    await page.getByRole("combobox", { name: "Publishing account" }).scrollIntoViewIfNeeded();
    await captureScreenshot(page, testInfo, `flow-${name.toLowerCase().replaceAll(" ", "-")}-settings-detail-320.png`, false);
  }
});
