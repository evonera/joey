import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: {}, getActiveTenantId: vi.fn(), requireRole: mocks.role }));
vi.mock("@/lib/db", () => ({ db: { insert: mocks.insert } }));
import { saveAgentConfig, saveAgentSchedule } from "../agent";

describe("workspace automation schedule authorization", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not invalidate brand memory when only the schedule changes", async () => {
    mocks.role.mockResolvedValueOnce("tenant-1");
    const upsert = vi.fn().mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoUpdate: upsert }) });
    expect(await saveAgentSchedule({ timezone: "UTC", activeDays: ["mon"], times: ["09:00"], selectedAccountIds: [] })).toEqual({ success: true });
    expect(upsert.mock.calls[0][0].set).not.toHaveProperty("updatedAt");
    expect(upsert.mock.calls[0][0].set).not.toHaveProperty("brandVoice");
  });
  it("rejects members before changing a schedule", async () => {
    mocks.role.mockRejectedValueOnce(new Error("Forbidden"));
    expect(await saveAgentSchedule({ timezone: "UTC", activeDays: ["mon"], times: ["09:00"], selectedAccountIds: [] })).toHaveProperty("error");
    expect(mocks.role).toHaveBeenCalledWith(["owner", "admin"]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("cannot bypass the schedule policy through the combined config action", async () => {
    mocks.role.mockRejectedValueOnce(new Error("Forbidden"));
    expect(await saveAgentConfig({ brandVoice: "Original", postingGoals: "Draft only", postingSchedule: { timezone: "UTC", activeDays: ["mon"], times: ["09:00"], selectedAccountIds: [] } })).toHaveProperty("error");
    expect(mocks.role).toHaveBeenCalledWith(["owner", "admin"]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
