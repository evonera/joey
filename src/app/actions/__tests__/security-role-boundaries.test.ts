import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: "viewer", query: vi.fn(), insert: vi.fn(), update: vi.fn(), provider: vi.fn() }));
async function membership(roles?: string[]) {
  if (roles && !roles.includes(mocks.role)) throw new Error("Forbidden");
  return { tenantId: "tenant-1", userId: "user-1", role: mocks.role };
}
vi.mock("@/lib/auth", () => ({
  getActiveTenantId: async () => "tenant-1",
  getActiveTenantMembership: (roles?: string[]) => membership(roles),
  requireRole: async (roles = ["owner", "admin"]) => (await membership(roles)).tenantId,
}));
vi.mock("@/lib/db", () => ({
  db: {
    query: new Proxy({}, { get: () => ({ findFirst: mocks.query, findMany: mocks.query }) }),
    insert: mocks.insert, update: mocks.update,
    transaction: async (fn: (tx: unknown) => unknown) => fn((await import("@/lib/db")).db),
  },
}));
vi.mock("@/lib/publisher-core", () => ({ getZernioClientForTenant: mocks.provider, executePublishDraft: mocks.provider }));
vi.mock("@/lib/theme-studio/publishing/publisher", () => ({ publishContentPackage: mocks.provider }));
vi.mock("@/lib/flows/run-flow-server", () => ({ startFlowRun: mocks.provider, executeAdmittedFlowRun: mocks.provider }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { activateThemePage } from "../theme-pages";
import { approveDraft, updateDraft, deleteDraft } from "../drafts";
import { publishDraft } from "../publisher";
import { createManualPost } from "../compose";
import { approveReply, sendReply, updateReplyDraft, skipEngagementItem } from "../engagement";
import { publishThemePackage } from "../theme-packages";
import { createFlow, saveFlow, setFlowStatus, runFlow, provisionFlowWebhookSecret, installTemplate, deleteFlow } from "../flows";
import { createScout, updateScout, deleteScout } from "../scouts";
import { startChatVideoRender } from "../chat-video";
import { cancelMediaRender, retryMediaRender } from "../media";

const input = { content: "hello", mediaUrls: [], accountIds: ["account-1"], scheduleType: "draft" as const };
const scoutInput = { name: "Scout", targetUrl: "https://instagram.com/example", goalCondition: "spike" };
const privilegedCalls = [
  () => activateThemePage("page", "draft_only"),
  () => approveDraft("draft"), () => publishDraft("draft"), () => approveReply("reply"), () => sendReply("reply"),
  () => saveFlow("flow", { graph: {} }), () => setFlowStatus("flow", "active"), () => runFlow("flow"),
  () => provisionFlowWebhookSecret("flow"), () => publishThemePackage("pkg"),
];
const draftCalls = [
  () => updateDraft("draft", "content"), () => deleteDraft("draft"), () => createManualPost(input),
  () => createFlow("flow"), () => installTemplate("template"), () => deleteFlow("flow"),
  () => saveFlow("flow", { name: "draft" }), () => setFlowStatus("flow", "draft"),
  () => createScout(scoutInput), () => updateScout("scout", scoutInput), () => deleteScout("scout"),
  () => updateReplyDraft("reply", "content"), () => skipEngagementItem("item"),
  () => startChatVideoRender({}), () => cancelMediaRender("job"), () => retryMediaRender("job"),
];
async function callDenied(call: () => Promise<unknown>) {
  try { expect(await call()).toHaveProperty("error"); }
  catch (error) { expect(String(error)).toContain("Forbidden"); }
}
describe("Direct Server Action security boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.role = "viewer"; vi.spyOn(console, "error").mockImplementation(() => {}); });
  it.each(["viewer", "unknown"])("%s cannot reach draft mutation sinks", async role => {
    mocks.role = role;
    for (const call of draftCalls) await callDenied(call);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["viewer", "editor", "member", "unknown"])("%s cannot approve, publish, activate or run flows", async role => {
    mocks.role = role;
    mocks.query.mockResolvedValue({ id: "flow", status: "active" });
    for (const call of privilegedCalls) await callDenied(call);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it.each(["member", "editor"])("%s retains compose drafting without a scheduling bypass", async role => {
    mocks.role = role;
    mocks.query.mockResolvedValue([{ id: "account-1", platform: "x" }]);
    mocks.insert.mockReturnValue({ values: () => ({ returning: async () => [{ id: "draft" }] }) });
    expect(await createManualPost(input)).toMatchObject({ success: true });
    mocks.insert.mockClear();
    for (const mode of ["now", "scheduled"] as const) {
      expect(await createManualPost({ ...input, scheduleType: mode, confirmedAt: new Date().toISOString(), scheduledFor: "2099-01-01T00:00:00Z" })).toMatchObject({ error: "Forbidden" });
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin"])("%s retains publishing access", async role => {
    mocks.role = role;
    mocks.provider.mockResolvedValue({ success: true });
    expect(await publishThemePackage("pkg")).toMatchObject({ success: true });
    expect(mocks.provider).toHaveBeenCalledWith("pkg", "tenant-1");
  });
});
