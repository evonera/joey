import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWorkspaceRole } from "./require-workspace-role";

const membership = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { query: { member: { findFirst: membership } } } }));
const caller = { principalId: '["user-1","tenant-1"]', principalType: "user", attributes: { tenantId: "tenant-1" } };

describe("Agent workspace mutation roles", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["owner", "admin"])("permits %s to manage flows", async (role) => {
    membership.mockResolvedValue({ role });
    expect(await requireWorkspaceRole(caller)).toBe("tenant-1");
  });
  it.each(["member", "editor"])("permits %s drafts but not privileged mutations", async (role) => {
    membership.mockResolvedValue({ role });
    await expect(requireWorkspaceRole(caller)).rejects.toThrow("Forbidden");
    expect(await requireWorkspaceRole(caller, ["owner", "admin", "member", "editor"])).toBe("tenant-1");
  });
  it.each(["viewer", "unknown", null])("fails closed for role %s or missing membership", async (role) => {
    membership.mockResolvedValue(role ? { role } : null);
    await expect(requireWorkspaceRole(caller, ["owner", "admin", "member", "editor"])).rejects.toThrow("Forbidden");
  });
  it("rejects cross-tenant principal encodings before membership lookup", async () => {
    await expect(requireWorkspaceRole({ ...caller, principalId: '["user-1","other-tenant"]' })).rejects.toThrow("Invalid principal");
    expect(membership).not.toHaveBeenCalled();
  });
  it("preserves owner cron identities", async () => {
    membership.mockResolvedValue({ role: "owner" });
    expect(await requireWorkspaceRole({ ...caller, principalId: "user-1" })).toBe("tenant-1");
  });
  it("blocks viewer reply drafting through the agent's alternate entry point", async () => {
    membership.mockResolvedValue({ role: "viewer" });
    const tool = (await import("../tools/reply_to_comment")).default;
    await expect(tool.execute({ engagementItemId: "item", content: "reply" }, {
      session: { auth: { current: caller } },
    } as never)).rejects.toThrow("Forbidden");
  });
  it("blocks viewer flow and Scout creation, including direct execution without schema parsing", async () => {
    membership.mockResolvedValue({ role: "viewer" });
    const ctx = { session: { auth: { current: caller } } } as never;
    const flow = (await import("../tools/create_flow")).default;
    await expect(flow.execute({ name: "flow", templateSlug: "daily-news-curator", targetPlatform: "twitter" }, ctx)).rejects.toThrow("Forbidden");
    const scout = (await import("../tools/manage_scouts")).default;
    await expect(scout.execute({ action: "create", platform: "instagram", pollIntervalMinutes: 1440 }, ctx)).rejects.toThrow("Forbidden");
    const draft = (await import("../tools/draft_post")).default;
    expect(await draft.execute({ platform: "twitter", content: "draft" }, ctx)).toMatchObject({ error: expect.stringContaining("Forbidden") });
  });
  it("rejects unsafe Scout input when execution bypasses the Zod schema", async () => {
    membership.mockResolvedValue({ role: "member" });
    const scout = (await import("../tools/manage_scouts")).default;
    for (const interval of [0, -1, 15.5, Infinity, NaN]) {
      await expect(scout.execute({ action: "create", platform: "instagram", pollIntervalMinutes: interval as 1440 }, { session: { auth: { current: caller } } } as never)).rejects.toThrow("whole number");
    }
  });
});
