import { describe, expect, it, vi, beforeEach } from "vitest";

const mockScoutFindMany = vi.fn();
const mockScoutFindFirst = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      scouts: {
        findMany: (...args: unknown[]) => mockScoutFindMany(...args),
        findFirst: (...args: unknown[]) => mockScoutFindFirst(...args),
      },
      member: {
        findFirst: vi.fn().mockResolvedValue({ userId: "owner-1", role: "owner" }),
      },
    },
    insert: () => ({
      values: (...args: unknown[]) => {
        mockInsert(...args);
        return {
          returning: () => [
            {
              id: "scout-123",
              name: "Test Scout",
              targetUrl: "https://instagram.com/test",
              platform: "instagram",
              goalCondition: "Alert when views > 50k",
            },
          ],
        };
      },
    }),
    update: () => ({
      set: (...args: unknown[]) => {
        mockUpdate(...args);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      },
    }),
  },
}));

vi.mock("@/lib/flows/nodes/data/apify-actor", () => ({
  resolveToken: vi.fn().mockRejectedValue(new Error("No Apify token")),
}));

describe("Scouts Evaluator and Tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when scout is not found", async () => {
    mockScoutFindFirst.mockResolvedValueOnce(null);
    const { evaluateScout } = await import("../evaluator");
    await expect(evaluateScout("non-existent")).rejects.toThrow("not found");
  });

  it("evaluates a scout and detects simulated viral spike", async () => {
    mockScoutFindFirst.mockResolvedValueOnce({
      id: "scout-1",
      tenantId: "tenant-1",
      name: "Viral Competitor",
      targetUrl: "https://instagram.com/viral",
      platform: "instagram",
      goalCondition: "Alert when views > 50k",
      latestAlert: null,
    });

    const { evaluateScout } = await import("../evaluator");
    const res = await evaluateScout("scout-1");

    expect(res.triggered).toBe(true);
    expect(res.alert).toBeDefined();
    expect(res.alert?.changes.length).toBeGreaterThan(0);
    expect(res.itemsFound).toBeGreaterThan(0);
  });

  it("manage_scouts tool handles list and create actions", async () => {
    const tool = (await import("../../../../agent/tools/manage_scouts")).default as any;
    const ctx = { session: { auth: { current: { attributes: { tenantId: "tenant-1" } } } } };

    mockScoutFindMany.mockResolvedValueOnce([
      {
        id: "scout-1",
        name: "Test",
        targetUrl: "https://instagram.com/test",
        platform: "instagram",
        goalCondition: "Views > 50k",
        isActive: true,
        pollIntervalMinutes: 120,
        lastPolledAt: new Date(),
        latestAlert: null,
      },
    ]);

    const listRes = await tool.execute({ action: "list" }, ctx);
    expect(listRes.total).toBe(1);
    expect(listRes.scouts[0].name).toBe("Test");

    const createRes = await tool.execute(
      {
        action: "create",
        name: "New Scout",
        targetUrl: "https://instagram.com/new",
        goalCondition: "Spike alerts",
      },
      ctx
    );
    expect(createRes.message).toContain("created successfully");
  });
});
