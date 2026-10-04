import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { isAbsolute, join } from "node:path";
import { readFile } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { OutboundRequestOptions } from "@/lib/flows/outbound-request";

const transport = vi.hoisted(() => ({ request: vi.fn() }));
// Only replace the network hop. The actual provider, URL/source validation,
// Cloud-header helper, serialization and response parser execute unchanged.
vi.mock("@/lib/flows/outbound-request", async (original) => ({
  ...await original<typeof import("@/lib/flows/outbound-request")>(),
  outboundRequest: transport.request,
}));
// Keep the actual public resolveOutboundTarget URL/IP checks; avoid hosted DNS.
vi.mock("dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]) }));
import { CustomScoutProvider } from "@/lib/scouts/data-provider";

const cloudRoot = process.env.JOEY_CLOUD_REPO_PATH || "";
const databaseUrl = process.env.JOEY_CLOUD_TEST_DATABASE_URL || "";
const localDatabase = new URL(databaseUrl);
if (!isAbsolute(cloudRoot) || !["postgres:", "postgresql:"].includes(localDatabase.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(localDatabase.hostname) ||
    !/^\/[A-Za-z0-9_]+_test$/.test(localDatabase.pathname))
  throw new Error("Contract acceptance requires an absolute Cloud checkout and local *_test Postgres database.");
const manifest = JSON.parse(await readFile(join(cloudRoot, "package.json"), "utf8"));
if (manifest.name !== "@evonera/joey-cloud") throw new Error("Selected checkout is not Joey Cloud.");

// Vitest transforms the operator-selected TS sources and their local imports;
// this is not a copied Cloud handler, store, schema, key implementation or SDK.
const { createApp } = await import(join(cloudRoot, "src/server.ts"));
const { connectDatabase } = await import(join(cloudRoot, "src/db/client.ts"));
const { PostgresStore } = await import(join(cloudRoot, "src/db/store.ts"));
const { workspaces, serviceKeys, collectionRuns, dailyUsage } = await import(join(cloudRoot, "src/db/schema.ts"));
const { mintKey, keyDigest } = await import(join(cloudRoot, "src/keys.ts"));
const { readConfig } = await import(join(cloudRoot, "src/config.ts"));
const { FixtureCollector } = await import(join(cloudRoot, "src/collectors.ts"));
const connection = connectDatabase(databaseUrl);
const pepper = Buffer.alloc(32, 27).toString("base64");
const endpoint = "https://contract-collector.example.com/v1/scouts/collect";
const modalKey = "local-modal-id", modalSecret = "local-modal-secret";
const targetA = "https://instagram.com/contract_a", targetB = "https://instagram.com/contract_b";
const created: string[] = [];
const reports: unknown[] = [];
const envelopes: Array<{ headers: Record<string, string>; body: string }> = [];
const fixture = new FixtureCollector("test");
let mode: "normal" | "invalid" | "throw" | "wait" = "normal";
let calls = 0, proxyCalls = 0, malformedWire = false;
let collectionStarted: (() => void) | undefined;
const collector = {
  id: "cross-repo-fixture-v1", costMicros: 1000,
  validate: (request: unknown) => fixture.validate(request),
  async collect(request: unknown, signal: AbortSignal) {
    calls++;
    collectionStarted?.();
    if (mode === "wait") await new Promise<void>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    if (mode === "throw") throw new Error("private-provider-body secret-token private-caption");
    if (mode === "invalid") return { version: 1, items: [{ id: "private-caption", url: "http://127.0.0.1", text: "secret-token" }] };
    return fixture.collect(request, signal);
  },
};
const app = createApp(readConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl, SERVICE_KEY_PEPPER: pepper,
  COLLECTION_ENABLED: "true", COLLECTOR: "fixture", COLLECTION_TIMEOUT_MS: "5000" }),
new PostgresStore(connection.db), collector, { dnsCheck: async () => {}, logging: false,
  reporter: (report: unknown) => { reports.push(report); } });
let cloudUrl = "", proxyUrl = "";
// HTTP proxy simulates only Modal's outer credential gate. Abort propagation
// uses real sockets so Cloud sees disconnects; it is not Fastify.inject().
const proxy = createServer(async (req, res) => {
  proxyCalls++;
  if (req.headers["modal-key"] !== modalKey || req.headers["modal-secret"] !== modalSecret) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "private-gate-body secret-token" }));
    return;
  }
  const controller = new AbortController();
  res.once("close", () => { if (!res.writableFinished) controller.abort(); });
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) =>
      ["authorization", "content-type", "idempotency-key"].includes(name))) as Record<string, string>;
    const response = await fetch(`${cloudUrl}/v1/scouts/collect`, {
      method: "POST", headers, body: Buffer.concat(chunks), signal: controller.signal, redirect: "error",
    });
    const body = await response.text();
    // The proxy may intentionally corrupt a fixture envelope below. Do not
    // retain the upstream content length/transfer framing after reserialization.
    res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([name]) =>
      !["content-length", "transfer-encoding"].includes(name))));
    res.end(malformedWire && response.ok ? JSON.stringify({ version: 2, items: [] }) : body);
  } catch {
    if (!res.destroyed) { res.writeHead(502); res.end("local transport interrupted"); }
  }
});
async function provision(target: string, dailyLimit = 20) {
  const [workspace] = await connection.db.insert(workspaces).values({
    name: "Disposable actual Joey contract", joeyTenantId: crypto.randomUUID(), enabled: true,
    permissionReference: "local-fixture-only", allowedTargets: [target], dailyLimit, minuteLimit: 100, activeLimit: 10,
  }).returning();
  created.push(workspace.id);
  const token = mintKey();
  const [key] = await connection.db.insert(serviceKeys).values({ workspaceId: workspace.id,
    digest: keyDigest(token, pepper), label: "local acceptance only", expiresAt: new Date(Date.now() + 3600_000) }).returning();
  return { workspace, key, token, provider: new CustomScoutProvider(endpoint, token) };
}
function collect(provider: CustomScoutProvider, target = targetA, operationId = crypto.randomUUID(), signal = new AbortController().signal) {
  return provider.fetchRecentPosts({ platform: "instagram", targetUrl: target }, { signal, operationId });
}
beforeAll(async () => {
  await migrate(connection.db, { migrationsFolder: join(cloudRoot, "drizzle") });
  cloudUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("No local proxy address.");
  proxyUrl = `http://127.0.0.1:${address.port}`;
  transport.request.mockImplementation(async (url: string, options: OutboundRequestOptions) => {
    expect(url).toBe(endpoint);
    expect(options.maxRedirects).toBe(0);
    expect(options.timeoutMs).toBe(50_000);
    expect(options.maxBytes).toBe(2 * 1024 * 1024);
    envelopes.push({ headers: options.headers || {}, body: options.body || "" });
    const response = await fetch(proxyUrl, { method: options.method, headers: options.headers,
      body: options.body, signal: options.signal, redirect: "error" });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > (options.maxBytes || 0)) throw new Error("Response too large.");
    return { status: response.status, headers: Object.fromEntries(response.headers), buffer, finalUrl: endpoint };
  });
});
beforeEach(() => {
  mode = "normal"; malformedWire = false; calls = 0; proxyCalls = 0; collectionStarted = undefined;
  reports.length = 0; envelopes.length = 0;
  vi.stubEnv("SCOUT_MODAL_ENDPOINT", endpoint);
  vi.stubEnv("SCOUT_MODAL_KEY", modalKey);
  vi.stubEnv("SCOUT_MODAL_SECRET", modalSecret);
});
afterAll(async () => {
  proxy.closeAllConnections();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await app.close();
  if (created.length) {
    await connection.db.delete(collectionRuns).where(inArray(collectionRuns.workspaceId, created));
    await connection.db.delete(serviceKeys).where(inArray(serviceKeys.workspaceId, created));
    await connection.db.delete(workspaces).where(inArray(workspaces.id, created));
  }
  await connection.close();
  vi.unstubAllEnvs();
});

describe("actual Joey CustomScoutProvider → simulated Modal gate → actual Cloud/Postgres", () => {
  it("preserves protocol/credentials, replays once, and isolates two workspaces", async () => {
    const a = await provision(targetA), b = await provision(targetB), operation = crypto.randomUUID();
    const first = await collect(a.provider, targetA, operation);
    expect(await collect(a.provider, targetA, operation)).toEqual(first);
    await expect(collect(b.provider, targetA, operation)).rejects.toMatchObject({ status: 403 });
    expect(await collect(b.provider, targetB, operation)).toHaveLength(1);
    expect(calls).toBe(2);
    expect(envelopes[0].headers).toMatchObject({ Authorization: `Bearer ${a.token}`, "Modal-Key": modalKey, "Modal-Secret": modalSecret });
    expect(envelopes[0].headers["Idempotency-Key"]).toMatch(/^jsc_[a-f0-9]{64}$/);
    expect(envelopes.every(({ headers }) => headers["Idempotency-Key"] === envelopes[0].headers["Idempotency-Key"])).toBe(true);
    expect(JSON.parse(envelopes[0].body)).toEqual({ version: 1, platform: "instagram", targetUrl: targetA, limit: 15 });
  });
  it("rejects Modal credentials and changed HTTPS destinations before Cloud collection", async () => {
    const a = await provision(targetA);
    vi.stubEnv("SCOUT_MODAL_SECRET", "wrong-local-secret");
    await expect(collect(a.provider)).rejects.toMatchObject({ status: 401 });
    vi.stubEnv("SCOUT_MODAL_ENDPOINT", "https://different.example.com/v1/scouts/collect");
    await expect(collect(a.provider)).rejects.toThrow("exact approved");
    expect(proxyCalls).toBe(1);
    expect(calls).toBe(0);
  });
  it("rechecks revocation and pause before cached evidence can replay", async () => {
    const a = await provision(targetA), b = await provision(targetB), operation = crypto.randomUUID();
    await collect(a.provider, targetA, operation);
    await collect(b.provider, targetB, operation);
    await connection.db.update(serviceKeys).set({ revokedAt: new Date() }).where(eq(serviceKeys.id, a.key.id));
    await connection.db.update(workspaces).set({ enabled: false }).where(eq(workspaces.id, b.workspace.id));
    await expect(collect(a.provider, targetA, operation)).rejects.toMatchObject({ status: 401 });
    await expect(collect(b.provider, targetB, operation)).rejects.toMatchObject({ status: 403 });
    expect(calls).toBe(2);
  });
  it("reserves only one paid attempt under concurrent daily-quota races", async () => {
    const a = await provision(targetA, 1);
    const outcomes = await Promise.allSettled(Array.from({ length: 6 }, () => collect(a.provider)));
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    for (const outcome of outcomes) if (outcome.status === "rejected") expect(outcome.reason).toMatchObject({ status: 429 });
    expect(calls).toBe(1);
    const [usage] = await connection.db.select().from(dailyUsage).where(eq(dailyUsage.workspaceId, a.workspace.id));
    expect(usage).toMatchObject({ attempts: 1, reservedMicros: 1000 });
  });
  it("rejects malformed Cloud collector output and malformed wire evidence", async () => {
    const a = await provision(targetA);
    mode = "invalid";
    await expect(collect(a.provider)).rejects.toMatchObject({ status: 502 });
    mode = "normal"; malformedWire = true;
    await expect(collect(a.provider)).rejects.toThrow("Invalid or oversized Custom Scout source response");
    expect(calls).toBe(2);
  });
  it("redacts upstream failures at both actual boundaries without retries", async () => {
    const a = await provision(targetA);
    mode = "throw";
    const error = await collect(a.provider).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ status: 500 });
    expect(String(error)).not.toMatch(/secret-token|private-caption|private-provider-body/);
    expect(JSON.stringify(reports)).not.toMatch(/secret-token|private-caption|private-provider-body|jcs_v1_/);
    expect(proxyCalls).toBe(1);
    expect(calls).toBe(1);
  });
  it("honors pre-cancellation and propagates mid-collection socket cancellation", async () => {
    const a = await provision(targetA), pre = new AbortController();
    pre.abort();
    await expect(collect(a.provider, targetA, crypto.randomUUID(), pre.signal)).rejects.toThrow();
    expect(proxyCalls).toBe(0);
    mode = "wait";
    const started = new Promise<void>((resolve) => { collectionStarted = resolve; });
    const controller = new AbortController(), operation = crypto.randomUUID();
    const pending = collect(a.provider, targetA, operation, controller.signal);
    // Attach the assertion before abort to avoid an unhandled rejection.
    const stopped = expect(pending).rejects.toThrow("failed or timed out");
    await started;
    controller.abort();
    await stopped;
    await expect.poll(async () => {
      const [run] = await connection.db.select().from(collectionRuns).where(eq(collectionRuns.workspaceId, a.workspace.id));
      return run?.status;
    }).toBe("failed");
    await expect(collect(a.provider, targetA, operation)).rejects.toMatchObject({ status: 409 });
    expect(calls).toBe(1);
    const [usage] = await connection.db.select().from(dailyUsage).where(eq(dailyUsage.workspaceId, a.workspace.id));
    expect(usage).toMatchObject({ attempts: 1, reservedMicros: 1000 });
  });
});
