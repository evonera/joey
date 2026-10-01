import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { requireDisposableDatabase } from "../integration/require-disposable-database";

test.beforeAll(async () => { await requireDisposableDatabase(); });

// This suite only writes to its new authenticated workspace on localhost.
// It never sends a model prompt, activates a schedule or connects a provider.
for (const width of [1440, 390]) {
  test(`paused agent creation, persisted editing and history fit at ${width}px`, async ({ page, context }, testInfo) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const signup = await context.request.post("/api/auth/sign-up/email", {
      headers: { origin: testInfo.project.use.baseURL as string, "x-forwarded-for": `2001:db8:${suffix.slice(0, 4)}:${suffix.slice(4)}::1` },
      data: { name: "Agency E2E", email: `agency-${randomUUID()}@example.test`, password: "Local-E2E-Only-2026!" },
    });
    expect(signup.ok(), await signup.text()).toBe(true);
    await page.setViewportSize({ width, height: 844 });
    expect((await page.goto("/agents"))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Your agents" })).toBeVisible();
    await page.getByRole("button", { name: "New", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create an agent" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Give your agent a name");
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Evidence editor");
    await dialog.getByRole("textbox", { name: "Brief", exact: true }).fill("Original evidence-led drafts; never publish automatically.");
    await dialog.getByRole("button", { name: "prism", exact: true }).click();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByText("No connected accounts.", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByText("Human review only", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Create paused agent" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
    if (width === 390) await page.getByRole("button", { name: "Show agents", exact: true }).click();
    const roster = page.getByRole("complementary", { name: "Agent roster" });
    await expect(roster.getByRole("button", { name: /Evidence editor/ })).toHaveAttribute("aria-pressed", "true");
    if (width === 390) await page.getByRole("button", { name: "Hide agents", exact: true }).click();
    await expect(page.getByRole("button", { name: "Enable daily drafts" })).toBeDisabled();
    await page.getByRole("button", { name: "Edit Evidence editor" }).click();
    const edit = page.getByRole("dialog", { name: "Edit agent" });
    await edit.getByRole("textbox", { name: "Name", exact: true }).fill("Research editor");
    await edit.getByRole("button", { name: "Continue", exact: true }).click();
    await edit.getByRole("button", { name: "Continue", exact: true }).click();
    await edit.getByRole("button", { name: "Save and pause" }).click();
    await expect(edit).toHaveCount(0, { timeout: 60_000 });
    await page.reload();
    await roster.getByRole("button", { name: /Research editor/ }).click();
    await expect(page.getByRole("heading", { name: "Research editor", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Resume conversation" })).toBeDisabled();
    const submit = page.getByRole("button", { name: "Submit", exact: true });
    await submit.scrollIntoViewIfNeeded();
    const composerBox = await submit.boundingBox();
    const workspaceBox = await page.getByRole("region", { name: "Agent workspace" }).boundingBox();
    expect(composerBox!.y + composerBox!.height, "the complete send control is reachable, not clipped by the agency shell").toBeLessThanOrEqual(workspaceBox!.y + workspaceBox!.height);
    await page.locator('section[aria-label="Agent workspace"] details summary').click();
    await expect(page.getByText("No automation runs yet.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 390) {
      await expect(page.getByRole("button", { name: "Show agents", exact: true })).toHaveAttribute("aria-expanded", "false");
      await page.getByRole("button", { name: "Show agents", exact: true }).click();
    }
    await page.getByRole("textbox", { name: "Search agents" }).fill("not-present");
    await expect(roster.getByText("No matching agents.")).toBeVisible();
    await page.getByRole("textbox", { name: "Search agents" }).clear();
    await expect(roster.getByRole("button", { name: /Research editor/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
