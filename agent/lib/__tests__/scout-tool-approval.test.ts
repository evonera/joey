import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalConfiguration } from "eve/tools/approval";

const mocks = vi.hoisted(() => ({ request: vi.fn(), response: vi.fn(), insert: vi.fn(), values: vi.fn(), returning: vi.fn(), scout: vi.fn(), evaluate: vi.fn() }));

vi.mock("eve/tools", () => ({ defineTool: (definition: unknown) => definition }));
vi.mock("@/lib/db", () => ({ db: { insert: mocks.insert, query: { scouts: { findFirst: mocks.scout } } } }));
vi.mock("@/lib/scouts/evaluator", () => ({ evaluateScout: mocks.evaluate }));
vi.mock("../workspace-approval", () => ({ workspaceApproval: () => ({ request: mocks.request, response: mocks.response }) }));
vi.mock("../require-workspace-role", () => ({ requireWorkspaceRole: vi.fn(async () => "tenant-1") }));

import tool from "../../tools/manage_scouts";
const approval = tool.approval as ApprovalConfiguration;

describe("Scout tool authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.request.mockResolvedValue("user-approval");
    mocks.response.mockResolvedValue({ status: "rejected", reason: "Only admins" });
    mocks.returning.mockResolvedValue([{ id: "scout-1", isActive: false }]);
    mocks.insert.mockReturnValue({ values: mocks.values.mockReturnValue({ returning: mocks.returning }) });
  });

  it("requires workspace approval for an immediate evaluation", async () => {
    const ctx = { toolInput: { action: "evaluate" } } as never;
    await expect(approval.request(ctx)).resolves.toBe("user-approval");
    expect(mocks.request).toHaveBeenCalledWith(ctx);
  });

  it.each(["list", "create", "get_alert"])("does not gate the drafting/read action %s", async (action) => {
    expect(await approval.request({ toolInput: { action } } as never)).toBe("not-applicable");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("uses the workspace role policy when an approval is answered", async () => {
    await expect(approval.response!({} as never)).resolves.toMatchObject({ status: "rejected" });
    expect(mocks.response).toHaveBeenCalledOnce();
  });

  it("cannot activate automatic monitoring through draft creation", async () => {
    await tool.execute({ action: "create", name: "Scout", targetUrl: "https://instagram.com/example", platform: "instagram", goalCondition: "New posts", pollIntervalMinutes: 1440 }, {
      session: { auth: { current: { attributes: { tenantId: "tenant-1" } } } },
    } as never);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", isActive: false }));
  });
  it("forwards Stop cancellation and never returns a cancelled result", async () => {
    const controller = new AbortController();
    mocks.scout.mockResolvedValue({ id: "scout-1", name: "Scout" });
    mocks.evaluate.mockImplementation(async () => { controller.abort(); return { triggered: false, itemsFound: 0 }; });
    await expect(tool.execute({ action: "evaluate", scoutId: "scout-1", platform: "instagram", pollIntervalMinutes: 1440 }, {
      session: { auth: { current: { attributes: { tenantId: "tenant-1" } } } }, abortSignal: controller.signal,
    } as never)).rejects.toThrow();
    expect(mocks.evaluate).toHaveBeenCalledWith("scout-1", expect.objectContaining({ signal: controller.signal }));
  });
});
