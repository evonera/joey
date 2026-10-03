import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const publish = vi.hoisted(() => vi.fn());
vi.mock("@/lib/publisher-core", () => ({ publishDueDrafts: publish }));
import { GET } from "./route";
describe("Publication tick", () => {
  beforeEach(() => { vi.stubEnv("CRON_SECRET", "fixture-only-secret"); vi.stubEnv("PUBLICATION_TICK_ENABLED", "true"); publish.mockReset(); });
  afterEach(() => vi.unstubAllEnvs());
  const request = () => new Request("https://example.invalid/api/cron/publication", { headers: { authorization: "Bearer fixture-only-secret" } });
  it("requires authentication and explicit hosting activation", async () => {
    expect((await GET(new Request("https://example.invalid"))).status).toBe(401);
    vi.stubEnv("PUBLICATION_TICK_ENABLED", "false"); expect((await GET(request())).status).toBe(503); expect(publish).not.toHaveBeenCalled();
  });
  it("bounds the batch and surfaces failed outcomes without leaking exception secrets", async () => {
    publish.mockResolvedValue({ published: 2, failed: 1, recovered: 0 }); expect((await GET(request())).status).toBe(503); expect(publish).toHaveBeenCalledWith({ limit: 10 });
    publish.mockRejectedValue(new Error("private-provider-key")); const failed = await GET(request()); expect(await failed.text()).not.toContain("private-provider-key");
    publish.mockResolvedValue({ published: 2, failed: 0, recovered: 0 }); expect((await GET(request())).status).toBe(200);
  });
});
