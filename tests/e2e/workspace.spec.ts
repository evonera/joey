import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("authenticated workspace routes remain usable on desktop and mobile", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signup = await context.request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL! },
    data: { name: "E2E Workspace", email: `workspace-${randomUUID()}@example.test`, password: "Local-E2E-Only-2026!" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  const routes = ["/dashboard", "/compose", "/drafts", "/calendar", "/flows", "/flows/templates", "/theme-studio", "/assets", "/engagement", "/analytics", "/settings", "/operations"];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} overflows at ${width}px`).toBe(true);
      if (route === "/calendar") {
        await expect(page.locator(".rbc-month-view")).toBeVisible();
        expect(await page.locator(".rbc-month-row").first().evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(40);
      }
    }
  }
  expect(errors).toEqual([]);
  await page.goto("/calendar?view=invalid");
  await expect(page.getByRole("combobox", { name: "Calendar view" })).toHaveValue("month");
  await page.getByRole("button", { name: /Create post for/ }).first().click();
  await expect(page).toHaveURL(/\/compose\?date=\d{4}-\d{2}-\d{2}/);
});

test("a new workspace can create a theme page and open every setup tab", async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  const signup = await context.request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL! },
    data: { name: "Theme E2E", email: `theme-${randomUUID()}@example.test`, password: "Local-E2E-Only-2026!" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  await page.goto("/theme-studio/new");
  await page.getByPlaceholder("e.g. Cricket World Daily or Pubity Style Hub").fill("Astronomy Daily");
  await page.getByPlaceholder("e.g. Cricket news, match stats, viral sporting moments").fill("Astronomy and space exploration");
  for (let step = 0; step < 4; step++) await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Create Theme Page", exact: true }).click();
  await expect(page).toHaveURL(/\/theme-studio\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const path = new URL(page.url()).pathname;
  for (const suffix of ["", "/sources", "/mix", "/templates", "/preview-day", "/settings"]) {
    expect((await page.goto(path + suffix))?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
  }
});


test("Instagram and TikTok templates are available and install as editable flows", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const signup = await context.request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL! },
    data: { name: "Template E2E", email: `templates-${randomUUID()}@example.test`, password: "Local-E2E-Only-2026!" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  for (const name of ["Instagram Theme Image", "TikTok Video Caption"]) {
    await page.goto("/flows/templates");
    const heading = page.getByRole("heading", { name, exact: true });
    await expect(heading).toBeVisible();
    await heading.locator("..").getByRole("button", { name: "Install", exact: true }).click();
    await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Create Draft", { exact: true }).first()).toBeVisible();
    await page.getByText("Create Draft", { exact: true }).first().click();
    await expect(page.getByRole("combobox", { name: "Publishing account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect a social account" })).toBeVisible();
  }
});
