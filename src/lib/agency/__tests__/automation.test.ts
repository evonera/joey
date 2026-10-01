import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  current: vi.fn(),
  profile: vi.fn(),
  finish: vi.fn(),
  attach: vi.fn(),
  evaluate: vi.fn(),
  remix: vi.fn(),
  apify: vi.fn(),
  exa: vi.fn(),
  model: vi.fn(),
  update: vi.fn(),
  slot: vi.fn(),
  format: vi.fn(),
  expiry: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    query: { themeSlots: { findFirst: mocks.slot }, themeContentFormats: { findFirst: mocks.format } },
    transaction: (fn: (tx: unknown) => unknown) => fn({ update: () => ({ set: () => ({ where: mocks.update }) }) }),
  },
}));
vi.mock("@/lib/agency/service", () => ({
  reserveAgencyRun: mocks.reserve,
  assertAgencyRunCurrent: mocks.current,
  getAgencyProfile: mocks.profile,
  finishAgencyRun: mocks.finish,
  attachAgencyDraft: mocks.attach,
  recordAgencyDispatchExpiry: mocks.expiry,
}));
vi.mock("@/lib/scouts/evaluator", () => ({ evaluateScout: mocks.evaluate }));
vi.mock("@/lib/scouts/remix-pipeline", () => ({ remixScoutAlertToThemeStudio: mocks.remix }));
vi.mock("@/lib/flows/nodes/data/apify-actor", () => ({ resolveToken: mocks.apify }));
vi.mock("@/lib/search/exa-client", () => ({ resolveExaKey: mocks.exa }));
vi.mock("@/lib/agent-model-resolver", () => ({ resolveModelForTurn: mocks.model }));
import { executeAgencyDraft, agencyDailyEventKey } from "../automation";
const actor = { tenantId: "tenant", userId: "owner" };
const run = {
  id: "receipt",
  tenantId: "tenant",
  agentId: "agent",
  configVersion: 1,
  leaseToken: "lease",
  sourceAlert: null,
};
const config = { scoutId: "source", themePageId: "page", accountIds: ["allowed"] };
const alert = { title: "A new source", targetUrl: "https://instagram.com/source", changes: [] };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AGENCY_AUTOMATION_ENABLED", "true");
  mocks.reserve.mockResolvedValue({ claimed: true, run });
  mocks.current.mockResolvedValue({ actor, config });
  mocks.profile.mockResolvedValue(config);
  mocks.slot.mockResolvedValue({ formatId: "instagram-format" });
  mocks.format.mockResolvedValue({ platform: "instagram" });
  mocks.finish.mockResolvedValue(true);
  mocks.evaluate.mockResolvedValue({ triggered: true, alert });
  mocks.remix.mockResolvedValue({ success: true, packageId: "draft", renderState: "queued" });
  mocks.expiry.mockResolvedValue({ id: "expired-receipt", status: "cancelled", packageId: null, duplicate: false });
});
afterEach(() => vi.unstubAllEnvs());
describe("Governed draft automation (no provider calls)", () => {
  it("has stable UTC daily identity", () =>
    expect(agencyDailyEventKey(new Date("2026-10-01T23:59:00Z"))).toBe("daily:2026-10-01"));
  it("does no work while the operator kill switch is disabled", async () => {
    vi.stubEnv("AGENCY_AUTOMATION_ENABLED", "false");
    await expect(executeAgencyDraft(actor, "agent", 1)).rejects.toThrow("disabled");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.apify).not.toHaveBeenCalled();
  });
  it("replays an existing receipt without any paid phase", async () => {
    mocks.reserve.mockResolvedValue({ claimed: false, run: { ...run, status: "queued", packageId: "draft" } });
    expect(await executeAgencyDraft(actor, "agent", 1)).toMatchObject({ duplicate: true, packageId: "draft" });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("short-circuits no-change checks without remix generation", async () => {
    mocks.evaluate.mockResolvedValue({ triggered: false });
    expect(await executeAgencyDraft(actor, "agent", 1)).toMatchObject({ noChange: true });
    expect(mocks.remix).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(run, "completed");
  });
  it("passes the captured fresh alert and only server-bound destinations; queued is success", async () => {
    expect(await executeAgencyDraft(actor, "agent", 1)).toMatchObject({ status: "queued", reviewRequired: true });
    expect(mocks.remix).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: actor.tenantId,
        alert,
        themePageId: "page",
        governance: expect.objectContaining({ accountIds: ["allowed"], configVersion: 1, runId: run.id }),
      })
    );
    expect(mocks.finish).toHaveBeenCalledWith(run, "queued", expect.objectContaining({ packageId: "draft" }));
    const policy = mocks.remix.mock.calls[0][0].governance;
    await policy.beforeCommit({});
    await policy.afterCommit({}, "draft");
    expect(mocks.attach).toHaveBeenCalledWith({}, run, "draft");
  });
  it("reuses persisted evidence after an interrupted research attempt", async () => {
    mocks.reserve.mockResolvedValue({ claimed: true, run: { ...run, sourceAlert: alert } });
    await executeAgencyDraft(actor, "agent", 1);
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.remix).toHaveBeenCalledWith(expect.objectContaining({ alert }));
  });
  it("does not start any paid phase after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(executeAgencyDraft(actor, "agent", 1, controller.signal)).rejects.toThrow();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("stops after permission revocation between Scout and research", async () => {
    mocks.evaluate.mockImplementation(async () => {
      mocks.current.mockRejectedValue(new Error("Paused"));
      return { triggered: true, alert };
    });
    mocks.finish.mockResolvedValue(false);
    expect(await executeAgencyDraft(actor, "agent", 1)).toMatchObject({ status: "cancelled" });
    expect(mocks.remix).not.toHaveBeenCalled();
  });
  it("fails closed on missing credentials/budget without scraping", async () => {
    mocks.model.mockRejectedValue(new Error("Budget exhausted"));
    expect(await executeAgencyDraft(actor, "agent", 1)).toMatchObject({ status: "failed" });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("rejects expired schedule days before reservations or paid calls", async () => {
    expect(await executeAgencyDraft(actor, "agent", 1, undefined, "2000-01-01")).toMatchObject({ status: "cancelled", expired: true, runId: "expired-receipt" });
    expect(mocks.expiry).toHaveBeenCalledWith(actor, "agent", 1, "2000-01-01");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.apify).not.toHaveBeenCalled();
  });
  it.each(["completed", "queued", "running", "failed"])("preserves an existing %s receipt when a delayed dispatch expires", async (status) => {
    mocks.expiry.mockResolvedValue({ id: "existing-receipt", status, packageId: "existing-draft", duplicate: true });
    expect(await executeAgencyDraft(actor, "agent", 1, undefined, "2000-01-01")).toMatchObject({ status, expired: true, runId: "existing-receipt", packageId: "existing-draft", duplicate: true });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("uses the pinned current schedule day as its shared manual receipt", async () => {
    await executeAgencyDraft(actor, "agent", 1, undefined, agencyDailyEventKey().slice(6));
    expect(mocks.reserve).toHaveBeenCalledWith(actor, "agent", 1, agencyDailyEventKey());
  });
  it.each([undefined, { platform: "linkedin" }])("rejects missing/non-Instagram formats before resolving paid providers", async (format) => {
    mocks.format.mockResolvedValue(format);
    expect(await executeAgencyDraft(actor, "agent", 1)).toMatchObject({ status: "failed" });
    expect(mocks.apify).not.toHaveBeenCalled();
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("rejects a slotless page before provider resolution", async () => {
    mocks.slot.mockResolvedValue(undefined);
    expect(await executeAgencyDraft(actor, "agent", 1)).toMatchObject({ status: "failed" });
    expect(mocks.format).not.toHaveBeenCalled();
    expect(mocks.apify).not.toHaveBeenCalled();
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("observes a cancellation after scraping before research starts", async () => {
    const controller = new AbortController();
    mocks.evaluate.mockImplementation(async () => { controller.abort(); return { triggered: true, alert }; });
    expect(await executeAgencyDraft(actor, "agent", 1, controller.signal)).toMatchObject({ status: "failed" });
    expect(mocks.remix).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(run, "failed", expect.objectContaining({ error: expect.stringContaining("cancelled") }));
  });
  it("fences a cancellation at atomic draft commit, even after research completed", async () => {
    const controller = new AbortController();
    mocks.remix.mockImplementation(async ({ governance }) => {
      controller.abort();
      await governance.beforeCommit({});
      await governance.afterCommit({}, "unsafe-draft");
    });
    expect(await executeAgencyDraft(actor, "agent", 1, controller.signal)).toMatchObject({ status: "failed" });
    expect(mocks.attach).not.toHaveBeenCalled();
  });
  it("never persists provider response text or secrets in run errors", async () => {
    mocks.remix.mockRejectedValue(new Error("provider secret=do-not-log"));
    await executeAgencyDraft(actor, "agent", 1);
    expect(JSON.stringify(mocks.finish.mock.calls)).not.toContain("do-not-log");
  });
});
