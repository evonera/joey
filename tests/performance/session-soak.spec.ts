import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { maximumEventsInWindow } from "@/lib/performance-soak";
import { navigateWithinApp, waitForSettledRoute } from './navigation';
import { writeFile } from 'node:fs/promises';

const DEFAULT_ROUTES = [
  "/dashboard",
  "/agents",
  "/compose",
  "/drafts",
  "/flows",
  "/theme-studio",
  "/calendar",
  "/analytics",
  "/engagement",
  "/accounts",
  "/settings",
];

type BrowserMetrics = {
  documents: number;
  heapUsedBytes: number;
  listeners: number;
  nodes: number;
  timestampMs: number;
};

function positiveNumber(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return value;
}

async function readMetrics(page: Page): Promise<BrowserMetrics> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Performance.enable");
    const result = await session.send("Performance.getMetrics");
    const values = new Map(result.metrics.map((metric) => [metric.name, metric.value]));
    return {
      documents: values.get("Documents") ?? 0,
      heapUsedBytes: values.get("JSHeapUsedSize") ?? 0,
      listeners: values.get("JSEventListeners") ?? 0,
      nodes: values.get("Nodes") ?? 0,
      timestampMs: Date.now(),
    };
  } finally {
    await session.detach();
  }
}

async function collectGarbage(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("HeapProfiler.collectGarbage");
  } finally {
    await session.detach();
  }
}

// Exercise controls repeatedly without submitting prompts, saving workspace
// changes, activating automation or calling paid providers.
async function exerciseReadOnlyControls(page: Page, route: string): Promise<string[]> {
  const exercised: string[] = [];
  if (route === "/agents") {
    const search = page.getByRole("textbox", { name: "Search agents" });
    await expect(search).toBeVisible();
    const original = await search.inputValue();
    await search.fill("soak-nonexistent-agent");
    await expect(page.getByText("No matching agents.", { exact: true })).toBeVisible();
    await search.fill(original);
    exercised.push("agent-roster-search");
    const identity = page.getByRole("complementary", { name: "Agent roster" }).locator("ul button").first();
    if (await identity.count()) {
      await identity.click();
      exercised.push("agent-selection");
    }
  } else if (route === "/drafts") {
    const search = page.getByRole("textbox", { name: "Search drafts by content or title" });
    await expect(search).toBeVisible();
    const original = await search.inputValue();
    await search.fill("soak-nonexistent-draft");
    await search.fill(original);
    exercised.push("draft-filter");
  } else if (route === "/compose") {
    const composer = page.getByRole("textbox", { name: "Post content" });
    await expect(composer).toBeVisible();
    const original = await composer.inputValue();
    await composer.fill("Local soak text; never submitted.");
    await expect(composer).toHaveValue("Local soak text; never submitted.");
    await composer.fill(original);
    exercised.push("local-compose-edit");
  } else if (route === "/calendar") {
    // The soak's Chromium viewport uses Joey's desktop calendar toolbar.
    const next = page.getByRole("button", { name: "Next period", exact: true });
    const back = page.getByRole("button", { name: "Previous period", exact: true });
    await expect(next).toBeVisible();
    await next.click();
    await back.click();
    exercised.push("calendar-navigation");
  }
  return exercised;
}

function isSignInPath(page: Page) {
  return /\/(sign-in|login)(?:\/|$)/.test(new URL(page.url()).pathname);
}

async function verifyAuthenticatedSession(page: Page) {
  const response = await page.request.get("/api/auth/get-session");
  if (!response.ok()) throw new Error(`Authentication probe returned HTTP ${response.status()}.`);
  const session = (await response.json()) as { user?: { id?: string } } | null;
  if (!session?.user?.id) {
    throw new Error("The soak does not have an authenticated session. Supply JOEY_SOAK_STORAGE_STATE.");
  }
}

async function attachReport(testInfo: TestInfo, report: unknown) {
  const path = testInfo.outputPath('session-soak-report.json');
  await writeFile(path, JSON.stringify(report, null, 2));
  await testInfo.attach("session-soak-report", {
    path,
    contentType: "application/json",
  });
}

test("authenticated active-session soak", async ({ page }, testInfo) => {
  const durationMs = positiveNumber("JOEY_SOAK_DURATION_MS", 30 * 60 * 1000);
  const dwellMs = positiveNumber("JOEY_SOAK_DWELL_MS", 5_000);
  const maxHeapGrowthBytes = positiveNumber("JOEY_SOAK_MAX_HEAP_GROWTH_MB", 64) * 1024 * 1024;
  const maxListenerGrowth = positiveNumber("JOEY_SOAK_MAX_LISTENER_GROWTH", 200);
  const maxRequestsPerMinute = positiveNumber("JOEY_SOAK_MAX_REQUESTS_PER_MINUTE", 30);
  const allowPublic = process.env.JOEY_SOAK_ALLOW_PUBLIC === "true";
  const routes = (process.env.JOEY_SOAK_ROUTES?.split(",") ?? DEFAULT_ROUTES)
    .map((route) => route.trim())
    .filter(Boolean);
  if (routes.length === 0 || routes.some((route) => !route.startsWith("/"))) {
    throw new Error("JOEY_SOAK_ROUTES must contain at least one comma-separated absolute path.");
  }

  const consoleErrors: string[] = [];
  const httpErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const serverErrors: string[] = [];
  const requestTimes = new Map<string, number[]>();
  const samples: BrowserMetrics[] = [];
  const interactions: Record<string, number> = {};
  let measurementStartedAt: number | null = null;
  let iteration = 0;
  let reportAttached = false;
  let documentNavigations = 0;
  let currentRoute = routes[0];
  const networkTimings: Array<{ method: string; path: string; phase: string; startTime: number; responseStart: number; responseEnd: number }> = [];
  const requestPhases = new WeakMap<object, string>();
  const sanitizedUrl = (value: string) => {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  };
  const sanitizedMessage = (value: string) => value.replace(/https?:\/\/[^\s'"<>]+/g, sanitizedUrl);
  const assertObservedErrors = () => {
    expect(pageErrors, 'Unhandled browser errors or promise rejections').toEqual([]);
    expect(consoleErrors, 'Browser console errors').toEqual([]);
    expect(httpErrors, 'HTTP client errors').toEqual([]);
    expect(requestFailures, 'Non-aborted network failures').toEqual([]);
    expect(serverErrors, 'Server responses with status 5xx').toEqual([]);
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      const source = message.location().url;
      const messageText = sanitizedMessage(message.text());
      consoleErrors.push(source ? `${messageText} (${sanitizedUrl(source)})` : messageText);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(sanitizedMessage(error.message)));
  page.on("request", (request) => {
    requestPhases.set(request, measurementStartedAt === null ? 'warmup' : 'measurement');
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigations += 1;
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    requestTimes.set(key, [...(requestTimes.get(key) ?? []), Date.now()]);
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "unknown failure";
    if (!/ERR_ABORTED|NS_BINDING_ABORTED/i.test(reason)) {
      requestFailures.push(`${request.method()} ${sanitizedUrl(request.url())}: ${reason}`);
    }
  });
  page.on('requestfinished', request => {
    const timing = request.timing();
    networkTimings.push({
      method: request.method(), path: sanitizedUrl(request.url()),
      phase: requestPhases.get(request) ?? 'warmup',
      startTime: timing.startTime, responseStart: timing.responseStart, responseEnd: timing.responseEnd,
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${sanitizedUrl(response.url())}`);
    else if (response.status() >= 400) httpErrors.push(`${response.status()} ${sanitizedUrl(response.url())}`);
  });

  if (!allowPublic && !process.env.JOEY_SOAK_STORAGE_STATE) {
    throw new Error(
      "JOEY_SOAK_STORAGE_STATE is required. Set JOEY_SOAK_ALLOW_PUBLIC=true only for a public harness check.",
    );
  }
  try {
  await page.goto(routes[0], { waitUntil: "domcontentloaded" });
  if (!allowPublic) await verifyAuthenticatedSession(page);

  // Warm every route before recording the baseline so module loading and route
  // caches are not mistaken for leaks.
  for (const route of routes) {
    currentRoute = route;
    await navigateWithinApp(page, route);
    if (!allowPublic) await waitForSettledRoute(page, route);
    if (!allowPublic && isSignInPath(page)) {
      throw new Error(`Authentication expired while warming ${route}.`);
    }
    assertObservedErrors();
  }
  await collectGarbage(page);
  samples.push(await readMetrics(page));
  requestTimes.clear();

  const startedAt = Date.now();
  measurementStartedAt = startedAt;
  while (Date.now() - startedAt < durationMs) {
    const route = routes[iteration % routes.length];
    currentRoute = route;
    await navigateWithinApp(page, route);
    if (!allowPublic && isSignInPath(page)) {
      throw new Error(`Authentication expired while soaking ${route}.`);
    }
    if (!allowPublic) {
      await waitForSettledRoute(page, route);
      for (const interaction of await exerciseReadOnlyControls(page, route)) {
        interactions[interaction] = (interactions[interaction] ?? 0) + 1;
      }
    }
    // Stop on observed errors instead of spending the remaining 30 minutes
    // collecting evidence for a run that already cannot pass.
    assertObservedErrors();
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    if (iteration % routes.length === routes.length - 1) samples.push(await readMetrics(page));
    iteration += 1;
    await page.waitForTimeout(Math.min(dwellMs, Math.max(1, durationMs - (Date.now() - startedAt))));
  }

  // Compare equivalent UI, not a settings baseline against a potentially much
  // larger agent/editor page merely because the duration ended on that route.
  currentRoute = routes[routes.length - 1];
  await navigateWithinApp(page, currentRoute);
  if (!allowPublic) await waitForSettledRoute(page, currentRoute);
  await collectGarbage(page);
  const finalMetrics = await readMetrics(page);
  samples.push(finalMetrics);
  const baseline = samples[0];
  const noisyEndpoints = [...requestTimes.entries()]
    .map(([endpoint, times]) => ({
      endpoint,
      count: times.length,
      maximumRequestsInOneMinute: maximumEventsInWindow(times, 60_000),
    }))
    .filter((entry) => entry.maximumRequestsInOneMinute > maxRequestsPerMinute)
    .sort((left, right) => right.maximumRequestsInOneMinute - left.maximumRequestsInOneMinute);
  const report = {
    baseURL: testInfo.project.use.baseURL,
    consoleErrors,
    durationMs: Date.now() - startedAt,
    finalMetrics,
    heapGrowthBytes: finalMetrics.heapUsedBytes - baseline.heapUsedBytes,
    httpErrors,
    iterations: iteration,
    interactions,
    documentNavigations,
    networkTimings,
    listenerGrowth: finalMetrics.listeners - baseline.listeners,
    noisyEndpoints,
    pageErrors,
    requestFailures,
    routes,
    samples,
    serverErrors,
  };
  await attachReport(testInfo, report);
  reportAttached = true;

  assertObservedErrors();
  expect(noisyEndpoints, "Endpoints exceeding the polling/request-rate budget").toEqual([]);
  expect(report.heapGrowthBytes, "Garbage-collected JavaScript heap growth").toBeLessThanOrEqual(maxHeapGrowthBytes);
  expect(report.listenerGrowth, "JavaScript event-listener growth").toBeLessThanOrEqual(maxListenerGrowth);
  } catch (error) {
    if (!reportAttached) await attachReport(testInfo, {
      baseURL: testInfo.project.use.baseURL,
      completed: false,
      durationMs: measurementStartedAt === null ? 0 : Date.now() - measurementStartedAt,
      consoleErrors, httpErrors, pageErrors, requestFailures, serverErrors,
      iterations: iteration, interactions, documentNavigations, routes, samples,
      currentRoute, networkTimings,
      failure: error instanceof Error ? error.message : 'Soak stopped before final measurement.',
    });
    throw error;
  }
});
