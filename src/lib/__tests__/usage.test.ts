import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertBudget, recordTokenUsage, assertTrialQuota, FreeTrialLimitReachedError } from "../usage";
import { db } from "@/lib/db";

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const mockDb = {
    query: {
      usageTracking: {
        findFirst: vi.fn(),
      },
      agentConfigs: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    }),
    transaction: vi.fn(),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: 0 }]),
      }),
    }),
  };
  return { db: mockDb };
});

describe("Usage and Budget Enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permits operations when spend is within budget", async () => {
    const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    (db.query.usageTracking.findFirst as any).mockResolvedValue({
      id: "u-1",
      tenantId: "tenant-1",
      periodStart: currentMonth,
      estimatedCostUsd: "2.50",
      budgetLimitUsd: 10.0,
    });

    const check = await assertBudget("tenant-1");
    expect(check.allowed).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("pauses agent and marks pause_reason as budget_exceeded when limit reached", async () => {
    const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    (db.query.usageTracking.findFirst as any).mockResolvedValue({
      id: "u-1",
      tenantId: "tenant-1",
      periodStart: currentMonth,
      estimatedCostUsd: "10.50",
      budgetLimitUsd: 10.0,
    });

    const check = await assertBudget("tenant-1");
    expect(check.allowed).toBe(false);
    expect(db.update).toHaveBeenCalled();
  });

  it("resumes budget-paused agent on billing rollover", async () => {
    const previousMonth = new Date(2020, 0, 1);
    const previousUsage = {
      id: "u-1",
      tenantId: "tenant-1",
      periodStart: previousMonth,
      estimatedCostUsd: "15.00",
      reservedCostUsd: "0",
      budgetLimitUsd: 10.0,
    };
    (db.query.usageTracking.findFirst as any)
      .mockResolvedValueOnce({
        ...previousUsage,
      })
      .mockResolvedValueOnce({
        id: "u-1",
        tenantId: "tenant-1",
        periodStart: new Date(),
        estimatedCostUsd: "0",
        budgetLimitUsd: 10.0,
      });
    const lockedPrevious = { for: vi.fn().mockResolvedValue([previousUsage]) };
    const noOutstandingReservations = { for: vi.fn().mockResolvedValue([]) };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(lockedPrevious) }) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(noOutstandingReservations) }) }),
      update: db.update,
      insert: db.insert,
    };
    (db.transaction as any).mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    await assertBudget("tenant-1");

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalled();
  });

  it("records token usage correctly", async () => {
    const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    (db.query.usageTracking.findFirst as any).mockResolvedValue({
      id: "u-1",
      tenantId: "tenant-1",
      periodStart: currentMonth,
      estimatedCostUsd: "0",
      budgetLimitUsd: 10.0,
    });

    const res = await recordTokenUsage("tenant-1", 1000, 2000);
    expect(res.ok).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("permits operations when free trial generations are under 3", async () => {
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      }),
    });

    await expect(assertTrialQuota("tenant-trial", 3)).resolves.toBeUndefined();
  });

  it("throws FreeTrialLimitReachedError when 3 generations are exhausted", async () => {
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: 3 }]),
      }),
    });

    await expect(assertTrialQuota("tenant-trial", 3)).rejects.toThrow(FreeTrialLimitReachedError);
    await expect(assertTrialQuota("tenant-trial", 3)).rejects.toThrow(/rate_limit:trial/);
  });
});
