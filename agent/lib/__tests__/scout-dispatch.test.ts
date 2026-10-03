import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const start = vi.hoisted(() => vi.fn());
vi.mock("../scout-workflow", () => ({ startScoutBatch: start }));
import { handleScoutDispatch } from "../../channels/scout-dispatch";
import { scoutDispatchUrl } from "@/lib/scouts/scheduler";
const job = { scoutId: "00876663-41bd-40c5-b4dc-adf0010297bb", tenantId: "tenant", evaluationId: "edac9524-79e7-44c9-913d-b8a69c9b10c1", dispatchAttempt: 1, dispatchLeaseUntil: "2026-10-03T12:00:00Z" };
beforeEach(() => { vi.resetAllMocks(); start.mockResolvedValue({ runId: "workflow-receipt" }); vi.stubEnv("CRON_SECRET", "local-dispatch-only"); });
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown, authorization = "Bearer local-dispatch-only") => new Request("https://app.example/scout-dispatch", { method: "POST", headers: { "content-type": "application/json", authorization }, body: JSON.stringify(body) });
describe("Scout Workflow handoff bridge", () => {
  it("rejects unauthenticated requests before reading/starting any jobs", async () => {
    expect((await handleScoutDispatch(request({ jobs: [job] }, "Bearer wrong"))).status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });
  it("fails closed when the operator secret is unavailable", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await handleScoutDispatch(request({ jobs: [job] }))).status).toBe(401);
  });
  it("starts a validated bounded batch", async () => {
    expect((await handleScoutDispatch(request({ jobs: [job] }))).status).toBe(202);
    expect(start).toHaveBeenCalledWith([job]);
  });
  it.each([{ jobs: Array.from({ length: 26 }, () => job) }, { jobs: [] }, { jobs: [{ ...job, evaluationId: "bad" }] }, { jobs: [job], token: "secret" }])("rejects invalid dispatch envelopes", async (body) => {
    expect((await handleScoutDispatch(request(body))).status).toBe(400);
    expect(start).not.toHaveBeenCalled();
  });
  it("supports an explicit operator endpoint for the separated Eve runtime", () => {
    vi.stubEnv("EVE_SCOUT_DISPATCH_URL", "https://runtime.example/scout-dispatch");
    expect(scoutDispatchUrl()).toBe("https://runtime.example/scout-dispatch");
  });
  it("uses the built Eve local production port", () => {
    vi.stubEnv("EVE_SCOUT_DISPATCH_URL", ""); vi.stubEnv("VERCEL", ""); vi.stubEnv("EVE_NEXT_PRODUCTION_ORIGIN", ""); vi.stubEnv("EVE_NEXT_PRODUCTION_PORT", "4275");
    expect(scoutDispatchUrl()).toBe("http://127.0.0.1:4275/scout-dispatch");
  });
});
