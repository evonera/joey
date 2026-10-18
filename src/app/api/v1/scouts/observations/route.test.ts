import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), receive: vi.fn() }));
vi.mock("@/lib/api-auth", async original => ({ ...(await original<typeof import("@/lib/api-auth")>()), authenticateApiRequest: mocks.auth }));
vi.mock("@/lib/scouts/connector", async original => ({ ...(await original<typeof import("@/lib/scouts/connector")>()), receiveConnectorObservation: mocks.receive }));
import { POST } from "./route";
const payload = { version: 1, scoutId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", targetUrl: "https://www.instagram.com/creator/", platform: "instagram", items: [{ id: "post", url: "https://www.instagram.com/p/post/", text: "Actual source", likes: 0 }] };
function request(body: unknown) { return new Request("https://joey.example/api/v1/scouts/observations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ tenantId: "token-workspace", scopes: ["read", "write"], rateLimit: { remaining: 59, resetAt: Date.now() + 60000 } }); mocks.receive.mockResolvedValue({ evaluationId: "receipt", status: "pending", reused: false }); });
describe("Scout observation API boundary", () => {
  it("requires authentication before accepting evidence", async () => {
    mocks.auth.mockRejectedValue(new Error("Invalid API token"));
    expect((await POST(request(payload))).status).toBe(401);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
  it("read-only tokens cannot supply observations", async () => {
    mocks.auth.mockResolvedValue({ tenantId: "token-workspace", scopes: ["read"], rateLimit: { remaining: 59, resetAt: Date.now() + 60000 } });
    expect((await POST(request(payload))).status).toBe(403);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
  it("uses the token workspace and preserves a genuine zero", async () => {
    const response = await POST(request(payload));
    expect(response.status).toBe(202);
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("59");
    expect(mocks.receive).toHaveBeenCalledWith("token-workspace", payload);
  });
  it.each([{ ...payload, tenantId: "other" }, { ...payload, triggered: true }, { ...payload, items: [{ ...payload.items[0], likes: null }] }, { ...payload, items: [{ ...payload.items[0], observedAt: new Date().toISOString() }] }])("rejects injected workspace/decisions, unknown counters and upstream observation times", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
  it("caps request size before persistence", async () => {
    const body = { ...payload, padding: "a".repeat(128 * 1024) };
    expect((await POST(request(body))).status).toBe(413);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
});
