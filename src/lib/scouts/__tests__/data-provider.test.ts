import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apify: vi.fn(),
  outbound: vi.fn(),
  resolve: vi.fn(),
  key: vi.fn(),
  decrypt: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/flows/nodes/data/apify-actor", () => ({ resolveToken: mocks.apify }));
vi.mock("@/lib/flows/outbound-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/flows/outbound-request")>()),
  outboundRequest: mocks.outbound,
  resolveOutboundTarget: mocks.resolve,
}));
vi.mock("@/lib/db", () => ({ db: { query: { apiKeys: { findFirst: mocks.key } } } }));
vi.mock("@/lib/crypto", () => ({ decrypt: mocks.decrypt }));

import {
  ApifyScoutProvider,
  CustomScoutProvider,
  MockScoutProvider,
  getScoutDataProvider,
  getScoutProviderSetup,
} from "../data-provider";

const request = { targetUrl: "https://instagram.com/creator", platform: "instagram" };
const endpoint = "https://collector.vendor.com/v1/scouts/collect";
const item = {
  id: "post",
  url: "https://instagram.com/p/post",
  text: "Untrusted caption",
  views: 120,
  likes: 0,
  timestamp: "2026-10-01T00:00:00Z",
};
function response(value: unknown, status = 200) {
  return { status, headers: {}, finalUrl: endpoint, buffer: Buffer.from(JSON.stringify(value)) };
}
function context() {
  return { signal: new AbortController().signal, beforePaidPhase: vi.fn() };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SCOUT_DATA_PROVIDER", "apify");
  vi.stubEnv("ENABLE_MOCK_SCOUTS", "false");
  vi.stubEnv("SCOUT_PROVIDER_ENDPOINT", endpoint);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.apify.mockResolvedValue("apify-key");
  mocks.resolve.mockResolvedValue({ address: "8.8.8.8" });
  mocks.key.mockResolvedValue({ status: "active", encryptedKey: "encrypted-key" });
  mocks.decrypt.mockReturnValue("workspace-key");
  mocks.outbound.mockResolvedValue(response({ version: 1, items: [item] }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Scout provider selection and isolation", () => {
  it("keeps Apify as the independent default and resolves each workspace", async () => {
    expect((await getScoutDataProvider("tenant-a")).kind).toBe("apify");
    expect((await getScoutDataProvider("tenant-b")).kind).toBe("apify");
    expect(mocks.apify.mock.calls).toEqual([["tenant-a"], ["tenant-b"]]);
  });
  it("fails closed on an unknown mode or missing workspace", async () => {
    vi.stubEnv("SCOUT_DATA_PROVIDER", "cloud-typo");
    expect(await getScoutProviderSetup("tenant")).toMatchObject({ ready: false, provider: "unconfigured" });
    await expect(getScoutDataProvider("")).rejects.toThrow("workspace");
  });
  it("does not report production mocks ready or bypass missing credentials", async () => {
    vi.stubEnv("ENABLE_MOCK_SCOUTS", "true");
    mocks.apify.mockRejectedValue(new Error("missing"));
    expect(await getScoutProviderSetup("tenant")).toMatchObject({ ready: false, provider: "apify" });
    vi.stubEnv("SCOUT_DATA_PROVIDER", "mock");
    expect(await getScoutProviderSetup("tenant")).toMatchObject({ ready: false, provider: "mock" });
    await expect(new MockScoutProvider().fetchRecentPosts(request, context())).rejects.toThrow("production");
  });
  it("allows development mocks explicitly without paid collection", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_MOCK_SCOUTS", "true");
    vi.stubEnv("SCOUT_DATA_PROVIDER", "mock");
    const provider = await getScoutDataProvider("tenant");
    const ctx = context();
    expect(await provider.fetchRecentPosts(request, ctx)).toHaveLength(2);
    expect(await getScoutProviderSetup("tenant")).toMatchObject({ ready: true, provider: "mock" });
    expect(ctx.beforePaidPhase).not.toHaveBeenCalled();
    expect(mocks.outbound).not.toHaveBeenCalled();
  });
  it("decrypts custom credentials with the authenticated workspace, not a shared fallback", async () => {
    vi.stubEnv("SCOUT_DATA_PROVIDER", "custom");
    const provider = await getScoutDataProvider("tenant-a");
    expect(provider.kind).toBe("custom");
    expect(mocks.decrypt).toHaveBeenCalledWith("encrypted-key", "tenant-a");
    const query = mocks.key.mock.calls[0][0].where;
    // Inspect bound SQL params rather than assuming any matching row is safe.
    const { PgDialect } = await import("drizzle-orm/pg-core");
    expect(new PgDialect().sqlToQuery(query).params).toEqual(["tenant-a", "scout-data"]);
    mocks.key.mockResolvedValue({ status: "inactive", encryptedKey: "legacy" });
    expect(await getScoutProviderSetup("tenant-b")).toMatchObject({ ready: false, customEnabled: true });
    expect(mocks.apify).not.toHaveBeenCalled();
  });
  it.each([
    "http://collector.vendor.com",
    "https://user:secret@collector.vendor.com",
    "https://127.0.0.1/collect",
    "https://collector.vendor.com/?key=secret",
    "https://collector.vendor.com/#secret",
  ])("rejects unsafe operator endpoint %s", async (url) => {
    vi.stubEnv("SCOUT_DATA_PROVIDER", "custom");
    vi.stubEnv("SCOUT_PROVIDER_ENDPOINT", url);
    expect(await getScoutProviderSetup("tenant")).toMatchObject({ ready: false });
    expect(mocks.key).not.toHaveBeenCalled();
  });
});

describe("Custom provider collection contract", () => {
  it("sends a bounded, versioned request with no browser or tenant identity override", async () => {
    const ctx = context();
    const result = await new CustomScoutProvider(endpoint, "key").fetchRecentPosts(request, ctx);
    expect(result).toEqual([item]);
    expect(ctx.beforePaidPhase).toHaveBeenCalledOnce();
    expect(mocks.outbound).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        method: "POST",
        maxRedirects: 0,
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 50_000,
        signal: ctx.signal,
        headers: { Authorization: "Bearer key", "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, ...request, limit: 15 }),
      })
    );
    expect(ctx.beforePaidPhase.mock.invocationCallOrder[0]).toBeLessThan(mocks.outbound.mock.invocationCallOrder[0]);
  });
  it.each([
    { version: 2, items: [item] },
    { version: 1, items: Array(16).fill(item) },
    { version: 1, items: [{ ...item, text: "x".repeat(6001) }] },
    { version: 1, items: [{ ...item, views: -1 }] },
    { version: 1, items: [{ ...item, url: "https://127.0.0.1/post" }] },
    { version: 1, items: [{ ...item, url: "javascript:alert(1)" }] },
    { version: 1, items: [{ ...item, timestamp: "yesterday" }] },
    { version: 1, items: [item], publish: true },
  ])("rejects malformed evidence rather than recording no change", async (envelope) => {
    mocks.outbound.mockResolvedValue(response(envelope));
    await expect(new CustomScoutProvider(endpoint, "key").fetchRecentPosts(request, context())).rejects.toThrow(
      "Invalid"
    );
  });
  it("does not leak upstream bodies or retry/fall back after failure", async () => {
    mocks.outbound.mockResolvedValue(response({ error: "secret-token private-path" }, 429));
    await expect(new CustomScoutProvider(endpoint, "key").fetchRecentPosts(request, context())).rejects.toThrow(
      "Custom Scout provider returned HTTP 429."
    );
    expect(mocks.outbound).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.apify).not.toHaveBeenCalled();
  });
  it("maps redirect, timeout and oversized transport failures without exposing credentials", async () => {
    mocks.outbound.mockRejectedValue(new Error("redirect secret-key https://internal"));
    await expect(new CustomScoutProvider(endpoint, "key").fetchRecentPosts(request, context())).rejects.toThrow(
      "Custom Scout collection failed or timed out."
    );
  });
  it("does not collect after cancellation or denied paid-phase governance", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new CustomScoutProvider(endpoint, "key").fetchRecentPosts(request, { signal: controller.signal })
    ).rejects.toThrow();
    const ctx = context();
    ctx.beforePaidPhase.mockRejectedValue(new Error("Budget exhausted"));
    await expect(new CustomScoutProvider(endpoint, "key").fetchRecentPosts(request, ctx)).rejects.toThrow(
      "Budget exhausted"
    );
    expect(mocks.outbound).not.toHaveBeenCalled();
  });
  it("rejects targets that resolve privately before spending", async () => {
    mocks.resolve.mockRejectedValue(new Error("Private DNS"));
    const ctx = context();
    await expect(new CustomScoutProvider(endpoint, "key").fetchRecentPosts(request, ctx)).rejects.toThrow(
      "public HTTPS address"
    );
    expect(ctx.beforePaidPhase).not.toHaveBeenCalled();
    expect(mocks.outbound).not.toHaveBeenCalled();
  });
});

describe("Apify adapter", () => {
  it("preserves normalization, zero metrics and workspace governance", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "1", url: item.url, caption: "Caption", videoViewCount: 0, playCount: 999, likesCount: "12" },
        ])
      )
    );
    const ctx = context();
    expect(await new ApifyScoutProvider("key").fetchRecentPosts(request, ctx)).toEqual([
      expect.objectContaining({ text: "Caption", views: 0, likes: 12 }),
    ]);
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.not.stringContaining("key"),
      expect.objectContaining({ redirect: "error" })
    );
    expect(ctx.beforePaidPhase).toHaveBeenCalledOnce();
  });
  it.each([{}, [null], [{ url: "https://10.0.0.1/secret" }]])("rejects invalid dataset responses", async (dataset) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(dataset)));
    await expect(new ApifyScoutProvider("key").fetchRecentPosts(request, context())).rejects.toThrow("Invalid");
  });
  it("enforces streamed size bounds", async () => {
    mocks.fetch.mockResolvedValue(new Response('"' + "x".repeat(2 * 1024 * 1024) + '"'));
    await expect(new ApifyScoutProvider("key").fetchRecentPosts(request, context())).rejects.toThrow("oversized");
  });
});
