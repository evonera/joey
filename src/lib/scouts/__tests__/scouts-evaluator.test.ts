import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ scout: vi.fn(), receipt: vi.fn(), history: vi.fn(), reserve: vi.fn(), claim: vi.fn(), phase: vi.fn(), complete: vi.fn(), fail: vi.fn(), provider: vi.fn(), fetch: vi.fn(), gate: vi.fn(), llm: vi.fn(), delay: vi.fn() }));
vi.mock("node:timers/promises", async (original) => ({ ...await original<typeof import("node:timers/promises")>(), setTimeout: mocks.delay, default: { setTimeout: mocks.delay } }));
vi.mock("@/lib/db", () => ({ db: { query: { scouts: { findFirst: mocks.scout }, scoutEvaluations: { findFirst: mocks.receipt, findMany: mocks.history } } } }));
vi.mock("@/lib/scouts/data-provider", () => ({ getScoutDataProvider: mocks.provider }));
vi.mock("@/lib/typesafe", () => ({ evaluateScoutTriggerSemantically: mocks.gate }));
vi.mock("@/lib/llm", () => ({ runLlm: mocks.llm }));
vi.mock("../evaluation-receipts", async (original) => ({
  ...await original<typeof import("../evaluation-receipts")>(),
  reserveScoutEvaluation: mocks.reserve, claimScoutEvaluation: mocks.claim, markScoutEvaluationPhase: mocks.phase, completeScoutEvaluation: mocks.complete, failScoutEvaluation: mocks.fail,
}));
import { evaluateScout, isRepeatedScoutAlert, type ScoutAlert } from "../evaluator";
import { scoutConfigurationKey } from "../evaluation-receipts";
const scout = { id: "scout", tenantId: "tenant", name: "Competitor", targetUrl: "https://instagram.com/source", platform: "instagram", goalCondition: "Distinct original hook", pollIntervalMinutes: 120, isActive: true, updatedAt: new Date("2026-10-03"), latestAlert: null };
const receipt = { id: "receipt", tenantId: scout.tenantId, scoutId: scout.id, configKey: scoutConfigurationKey(scout), status: "pending", phase: "preparing", operationId: "00876663-41bd-40c5-b4dc-adf0010297bb", items: null };
const post = { id: "post", url: "https://instagram.com/p/post", text: "Verified source evidence", views: 125000 };
const judgement = { triggered: true, title: "Source spike", topPostIndex: 0, changes: [{ type: "ADDED" as const, label: "Views", after: "125k", rationale: "Goal met" }] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scout.mockResolvedValue(scout);
  mocks.reserve.mockResolvedValue(receipt);
  mocks.receipt.mockResolvedValue(receipt);
  mocks.history.mockResolvedValue([]);
  mocks.claim.mockResolvedValue({ claimed: true, receipt: { ...receipt, status: "running", leaseToken: "lease" } });
  mocks.phase.mockImplementation(async (current, phase, items) => ({ ...current, phase, ...(items ? { items } : {}) }));
  mocks.complete.mockImplementation(async (current, _scout, result, guard) => { await guard(); return { ...result, evaluationId: current.id }; });
  mocks.fail.mockImplementation(async (_receipt, error) => ({ error }));
  mocks.provider.mockResolvedValue({ fetchRecentPosts: mocks.fetch });
  mocks.fetch.mockImplementation(async (_request, context) => { await context.beforePaidPhase(); return [post]; });
  mocks.gate.mockResolvedValue(null);
  mocks.delay.mockResolvedValue(undefined);
  mocks.llm.mockResolvedValue({ text: JSON.stringify(judgement) });
});
describe("Durable Scout evaluator", () => {
  it("authorizes tenant ownership before reading or claiming evidence", async () => {
    await expect(evaluateScout(scout.id, { tenantId: "foreign" })).rejects.toThrow("does not belong");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects a missing Scout", async () => {
    mocks.scout.mockResolvedValue(undefined);
    await expect(evaluateScout("missing")).rejects.toThrow("not found");
  });
  it("persists an opaque collection operation ID before paid collection and captures intrinsic evidence", async () => {
    expect(await evaluateScout(scout.id)).toMatchObject({ triggered: true, evaluationId: receipt.id, itemsFound: 1, alert: { title: judgement.title } });
    expect(mocks.fetch).toHaveBeenCalledWith({ targetUrl: scout.targetUrl, platform: scout.platform }, expect.objectContaining({ operationId: receipt.operationId }));
    expect(mocks.phase.mock.calls.map((call) => call[1])).toEqual(["collecting", "collected", "judging"]);
    expect(mocks.phase).toHaveBeenCalledWith(expect.anything(), "collected", [expect.objectContaining({ ...post, observedAt: expect.any(String) })]);
  });
  it("reuses completed immutable evidence for another agent with no paid work", async () => {
    const result = { triggered: true, alert: { title: "Saved evidence" }, itemsFound: 1 };
    mocks.reserve.mockResolvedValue({ ...receipt, status: "completed", result });
    expect(await evaluateScout(scout.id, { eventKey: "daily:2026-10-03", beforePaidPhase: vi.fn() })).toMatchObject({ ...result, reused: true });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(mocks.llm).not.toHaveBeenCalled();
  });
  it("preserves repeated source findings for different agency consumers", async () => {
    const result = await evaluateScout(scout.id);
    mocks.scout.mockResolvedValue({ ...scout, latestAlert: result.alert });
    expect(await evaluateScout(scout.id)).toMatchObject({ triggered: true });
  });
  it.each(["uncertain", "failed"])("never collects again from a terminal %s receipt", async (status) => {
    mocks.reserve.mockResolvedValue({ ...receipt, status, error: "Review receipt" });
    expect(await evaluateScout(scout.id)).toMatchObject({ triggered: false, error: "Review receipt" });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does no paid work when another worker or the global capacity owns the lease", async () => {
    mocks.claim.mockResolvedValue({ claimed: false, receipt: { ...receipt, status: "running" } });
    expect(await evaluateScout(scout.id)).toMatchObject({ pending: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("resumes persisted collection evidence without fetching again", async () => {
    mocks.claim.mockResolvedValue({ claimed: true, receipt: { ...receipt, status: "running", phase: "collected", items: [post] } });
    expect(await evaluateScout(scout.id)).toMatchObject({ triggered: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.llm).toHaveBeenCalledOnce();
  });
  it("lets concurrent agency consumers wait for the same immutable evidence without collecting again", async () => {
    mocks.claim.mockResolvedValue({ claimed: false, receipt: { ...receipt, status: "running" } });
    mocks.receipt.mockResolvedValue({ ...receipt, status: "completed", result: { triggered: true, alert: { title: "Shared result" }, itemsFound: 1 } });
    expect(await evaluateScout(scout.id, { waitForEvidence: true })).toMatchObject({ reused: true, triggered: true, alert: { title: "Shared result" } });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.delay).toHaveBeenCalledWith(1000, undefined, { signal: expect.any(AbortSignal) });
  });
  it("stops an agency evidence wait immediately on cancellation", async () => {
    const controller = new AbortController();
    mocks.claim.mockResolvedValue({ claimed: false, receipt: { ...receipt, status: "running" } });
    mocks.delay.mockImplementation(async () => { controller.abort(); });
    await expect(evaluateScout(scout.id, { waitForEvidence: true, signal: controller.signal })).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it("does not repeat an uncertain collection found while waiting", async () => {
    mocks.claim.mockResolvedValue({ claimed: false, receipt: { ...receipt, status: "running" } });
    mocks.receipt.mockResolvedValue({ ...receipt, status: "uncertain", error: "Review interrupted collection" });
    expect(await evaluateScout(scout.id, { waitForEvidence: true })).toMatchObject({ error: "Review interrupted collection" });
    expect(mocks.claim).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("retries a capacity-blocked preparing receipt, never a paid phase", async () => {
    mocks.claim.mockResolvedValueOnce({ claimed: false, receipt });
    expect(await evaluateScout(scout.id, { waitForEvidence: true })).toMatchObject({ triggered: true });
    expect(mocks.claim).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("revalidates agency authorization throughout the evidence wait", async () => {
    mocks.claim.mockResolvedValue({ claimed: false, receipt: { ...receipt, status: "running" } });
    const guard = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Activation revoked"));
    await expect(evaluateScout(scout.id, { waitForEvidence: true, beforePaidPhase: guard })).rejects.toThrow("Activation revoked");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("bounds the collection signal and stops before reserving on initial cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(evaluateScout(scout.id, { signal: controller.signal })).rejects.toThrow();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("observes cancellation after collection before any judge phase", async () => {
    const controller = new AbortController();
    mocks.fetch.mockImplementation(async (_request, context) => { await context.beforePaidPhase(); controller.abort(); return [post]; });
    expect(await evaluateScout(scout.id, { signal: controller.signal })).toMatchObject({ error: expect.stringContaining("cancelled") });
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(mocks.llm).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("observes cancellation after the no-change pre-gate before persisting no-change", async () => {
    const controller = new AbortController();
    mocks.gate.mockImplementation(async () => { controller.abort(); return { triggered: false, confidence: 1, probability: 1 }; });
    expect(await evaluateScout(scout.id, { signal: controller.signal })).toMatchObject({ error: expect.stringContaining("cancelled") });
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.llm).not.toHaveBeenCalled();
  });
  it("uses the TypeSafe high-confidence pre-gate with a completion barrier", async () => {
    mocks.gate.mockResolvedValue({ triggered: false, confidence: 0.95, probability: 0.98 });
    expect(await evaluateScout(scout.id)).toMatchObject({ triggered: false, itemsFound: 1 });
    expect(mocks.llm).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), scout, { triggered: false, itemsFound: 1 }, expect.any(Function));
  });
  it("revalidates edited or paused scheduled Scouts before paid collection", async () => {
    mocks.scout.mockResolvedValueOnce(scout).mockResolvedValue({ ...scout, isActive: false });
    await expect(evaluateScout(scout.id, { requireActive: true })).rejects.toThrow("paused");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects a tenant-scoped handoff with a stale config key", async () => {
    mocks.receipt.mockResolvedValue({ ...receipt, configKey: "old" });
    await expect(evaluateScout(scout.id, { tenantId: scout.tenantId, evaluationId: receipt.id })).rejects.toThrow("configuration");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("records ambiguous paid errors against their receipt", async () => {
    mocks.fetch.mockImplementation(async (_request, context) => { await context.beforePaidPhase(); throw new Error("Collection timed out"); });
    expect(await evaluateScout(scout.id)).toMatchObject({ error: "Collection timed out" });
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ phase: "collecting" }), "Collection timed out");
    expect(mocks.llm).not.toHaveBeenCalled();
  });
  it("dedupes notifications for the same metrics even when change order differs", () => {
    const alert: ScoutAlert = { title: "Spike", detectedAt: "2026-10-03", targetUrl: scout.targetUrl, platform: scout.platform, goal: scout.goalCondition, changes: judgement.changes, samplePost: { url: post.url, content: post.text } };
    expect(isRepeatedScoutAlert(alert, { ...alert, detectedAt: "2026-10-04" })).toBe(true);
    expect(isRepeatedScoutAlert(alert, { ...alert, samplePost: { url: "https://instagram.com/p/other", content: post.text } })).toBe(false);
  });
  it("evaluates explicit thresholds from saved observations without model judgment", async () => {
    const numericScout = { ...scout, goalCondition: "views > 50k" };
    const numericReceipt = { ...receipt, configKey: scoutConfigurationKey(numericScout) };
    mocks.scout.mockResolvedValue(numericScout);
    mocks.reserve.mockResolvedValue(numericReceipt);
    mocks.claim.mockResolvedValue({ claimed: true, receipt: { ...numericReceipt, status: "running" } });
    expect(await evaluateScout(scout.id)).toMatchObject({ triggered: true, alert: { changes: [{ type: "ADDED", after: "125000 views" }] } });
    expect(mocks.llm).not.toHaveBeenCalled();
    expect(mocks.gate).not.toHaveBeenCalled();
  });

  it("drops model spike claims without historical counter evidence", async () => {
    mocks.llm.mockResolvedValue({ text: JSON.stringify({ ...judgement, changes: [{ ...judgement.changes[0], type: "SPIKE", before: "Average 15k" }] }) });
    expect(await evaluateScout(scout.id)).toMatchObject({ triggered: false });
  });
  it("uses actual saved counters instead of an invented model baseline", async () => {
    mocks.history.mockResolvedValue([{ items: [{ ...post, views: 100000, observedAt: "2026-10-01T00:00:00Z" }] }]);
    mocks.llm.mockResolvedValue({ text: JSON.stringify({ ...judgement, changes: [{ ...judgement.changes[0], type: "SPIKE", before: "Average 15k" }] }) });
    expect(await evaluateScout(scout.id)).toMatchObject({ triggered: true, alert: { changes: [{ before: expect.stringContaining("100000 views"), after: expect.stringContaining("125000 views") }] } });
  });

});
