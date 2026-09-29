import { randomUUID } from "node:crypto";
import { test, expect, type TestInfo } from "@playwright/test";

function signupHeaders(testInfo: TestInfo) {
  // Better Auth intentionally limits sign-up attempts to three per IP per
  // ten-second window. Give each test/retry its own documentation-range IPv6
  // address so retries test the application rather than the auth limiter.
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return { origin: testInfo.project.use.baseURL as string, "x-forwarded-for": `2001:db8::${suffix}` };
}

test("authenticated workspace routes remain usable on desktop and mobile", async ({ page, context }, testInfo) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signup = await context.request.post("/api/auth/sign-up/email", {
    headers: signupHeaders(testInfo),
    data: { name: "E2E Workspace", email: `workspace-${randomUUID()}@example.test`, password: "Local-E2E-Only-2026!" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  const routes = ["/dashboard", "/compose", "/drafts", "/calendar", "/flows", "/flows/templates", "/theme-studio", "/theme-studio/templates", "/assets", "/engagement", "/analytics", "/accounts", "/brandkit", "/settings", "/operations"];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
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
      await page.screenshot({ path: testInfo.outputPath(`${route.slice(1).replaceAll("/", "-")}-${width}.png`), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
  await page.goto("/dashboard?create=post");
  await expect(page.getByRole("button", { name: "Close sidepanel" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Details" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Chat creation panel overflows at 320px").toBe(true);
  await page.screenshot({ path: testInfo.outputPath("chat-create-post-320.png"), fullPage: true });
  await page.getByRole("button", { name: "Close sidepanel" }).click();
  await expect(page.getByRole("button", { name: "Create a post" })).toBeVisible();
  await page.goto("/calendar?view=invalid");
  await page.getByRole("button", { name: "Create post", exact: true }).click();
  await expect(page).toHaveURL(/\/compose\?date=\d{4}-\d{2}-\d{2}$/);
});

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
    await page.screenshot({ path: testInfo.outputPath(`theme-wizard-step-${step + 1}-320.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Theme wizard step ${step + 1} overflows at 320px`).toBe(true);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("theme-wizard-step-5-320.png"), fullPage: true });
  await page.getByRole("button", { name: "Create Theme Page", exact: true }).click();
  await expect(page).toHaveURL(/\/theme-studio\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const path = new URL(page.url()).pathname;
  for (const suffix of ["", "/sources", "/mix", "/templates", "/preview-day", "/settings"]) {
    expect((await page.goto(path + suffix))?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    if (suffix === "/settings") await expect(page.getByRole("heading", { name: "Theme Page Settings" })).toBeVisible();
    await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Theme section ${suffix || "overview"} overflows at 320px`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`theme${suffix.replaceAll("/", "-") || "-overview"}-320.png`), fullPage: true });
  }
  await page.goto(`${path}/preview-day`);
  await page.getByRole("button", { name: "Show Sample Day" }).click();
  await expect(page.getByRole("group", { name: "Slide indicators" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Next slide" }).first().click();
  await expect(page.getByRole("button", { name: "Slide 2, current" }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Theme samples overflow at 320px").toBe(true);
  await page.screenshot({ path: testInfo.outputPath("theme-preview-samples-320.png"), fullPage: true });
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
    await page.screenshot({ path: testInfo.outputPath(`flow-${name.toLowerCase().replaceAll(" ", "-")}-320.png`), fullPage: true });
    const draftStep = page.getByLabel("Flow steps").getByRole("button", { name: /Create Draft/ });
    await expect(draftStep).toBeVisible();
    await draftStep.click();
    await expect(page.getByRole("combobox", { name: "Publishing account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect a social account" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} settings overflow at 320px`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`flow-${name.toLowerCase().replaceAll(" ", "-")}-settings-320.png`), fullPage: true });
  }
});
