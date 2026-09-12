import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { maximumEventsInWindow } from "@/lib/performance-soak";

const DEFAULT_ROUTES = [
  "/dashboard",
  "/compose",
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

async function navigateWithinApp(page: Page, route: string) {
  const link = page.locator(`a[href="${route}"]`).first();
  if (await link.count()) {
    await link.click({ force: true });
    await page.waitForURL((url) => url.pathname === route, { timeout: 15_000 });
  } else {
    await page.goto(route, { waitUntil: "domcontentloaded" });
  }
  await page.waitForLoadState("domcontentloaded");
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
  await testInfo.attach("session-soak-report", {
    body: Buffer.from(JSON.stringify(report, null, 2)),
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

  page.on("console", (message) => {
    if (message.type() === "error") {
      const source = message.location().url;
      consoleErrors.push(source ? `${message.text()} (${source})` : message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    requestTimes.set(key, [...(requestTimes.get(key) ?? []), Date.now()]);
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "unknown failure";
    if (!/ERR_ABORTED|NS_BINDING_ABORTED/i.test(reason)) {
      requestFailures.push(`${request.method()} ${request.url()}: ${reason}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    else if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });

  if (!allowPublic && !process.env.JOEY_SOAK_STORAGE_STATE) {
    throw new Error(
      "JOEY_SOAK_STORAGE_STATE is required. Set JOEY_SOAK_ALLOW_PUBLIC=true only for a public harness check.",
    );
  }
  await page.goto(routes[0], { waitUntil: "domcontentloaded" });
  if (!allowPublic) await verifyAuthenticatedSession(page);

  // Warm every route before recording the baseline so module loading and route
  // caches are not mistaken for leaks.
  for (const route of routes) {
    await navigateWithinApp(page, route);
    if (!allowPublic && isSignInPath(page)) {
      throw new Error(`Authentication expired while warming ${route}.`);
    }
  }
  await collectGarbage(page);
  samples.push(await readMetrics(page));
  requestTimes.clear();

  const startedAt = Date.now();
  let iteration = 0;
  while (Date.now() - startedAt < durationMs) {
    const route = routes[iteration % routes.length];
    await navigateWithinApp(page, route);
    if (!allowPublic && isSignInPath(page)) {
      throw new Error(`Authentication expired while soaking ${route}.`);
    }
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    if (iteration % routes.length === routes.length - 1) samples.push(await readMetrics(page));
    iteration += 1;
    await page.waitForTimeout(Math.min(dwellMs, Math.max(1, durationMs - (Date.now() - startedAt))));
  }

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
    listenerGrowth: finalMetrics.listeners - baseline.listeners,
    noisyEndpoints,
    pageErrors,
    requestFailures,
    routes,
    samples,
    serverErrors,
  };
  await attachReport(testInfo, report);

  expect(pageErrors, "Unhandled browser errors or promise rejections").toEqual([]);
  expect(consoleErrors, "Browser console errors").toEqual([]);
  expect(httpErrors, "HTTP client errors").toEqual([]);
  expect(requestFailures, "Non-aborted network failures").toEqual([]);
  expect(serverErrors, "Server responses with status 5xx").toEqual([]);
  expect(noisyEndpoints, "Endpoints exceeding the polling/request-rate budget").toEqual([]);
  expect(report.heapGrowthBytes, "Garbage-collected JavaScript heap growth").toBeLessThanOrEqual(maxHeapGrowthBytes);
  expect(report.listenerGrowth, "JavaScript event-listener growth").toBeLessThanOrEqual(maxListenerGrowth);
});
