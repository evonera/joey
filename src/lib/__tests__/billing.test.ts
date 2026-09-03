import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkUsageLimits, requireProPlan, assertThemePageQuota, isProTenant } from "../billing";

vi.mock("@/lib/db", () => {
  return {
    db: {
      query: {
        tenants: {
          findFirst: vi.fn(),
        },
      },
      select: vi.fn(),
    },
  };
});

describe("Billing & Usage Limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BILLING_TEST_BYPASS;
  });

  it("identifies a Pro tenant accurately", async () => {
    const { db } = await import("@/lib/db");
    (db.query.tenants.findFirst as any).mockResolvedValue({
      subscriptionPlan: "pro",
      subscriptionStatus: "active",
    });

    const limits = await checkUsageLimits("tenant-pro");
    expect(limits.isPro).toBe(true);
    expect(limits.themePageLimit).toBe(100);
    expect(limits.allowsVideoRendering).toBe(true);

    const isPro = await isProTenant("tenant-pro");
    expect(isPro).toBe(true);

    await expect(requireProPlan("tenant-pro", "Video rendering")).resolves.toBe(true);
  });

  it("identifies a Free tenant and rejects Pro gated features", async () => {
    const { db } = await import("@/lib/db");
    (db.query.tenants.findFirst as any).mockResolvedValue({
      subscriptionPlan: "free",
      subscriptionStatus: "active",
    });

    const limits = await checkUsageLimits("tenant-free");
    expect(limits.isPro).toBe(false);
    expect(limits.themePageLimit).toBe(1);
    expect(limits.allowsVideoRendering).toBe(false);

    await expect(requireProPlan("tenant-free", "Video rendering")).rejects.toThrow(
      "Video rendering requires an active Pro subscription.",
    );
  });

  it("enforces theme page quotas on Free tier", async () => {
    const { db } = await import("@/lib/db");
    (db.query.tenants.findFirst as any).mockResolvedValue({
      subscriptionPlan: "free",
      subscriptionStatus: "active",
    });

    // Mock count query returning 1 existing page
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      }),
    });

    await expect(assertThemePageQuota("tenant-free")).rejects.toThrow(
      "Free workspace limit reached (1 Theme Page). Upgrade to Pro for unlimited theme pages.",
    );
  });

  it("allows theme page creation when under quota", async () => {
    const { db } = await import("@/lib/db");
    (db.query.tenants.findFirst as any).mockResolvedValue({
      subscriptionPlan: "free",
      subscriptionStatus: "active",
    });

    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: 0 }]),
      }),
    });

    await expect(assertThemePageQuota("tenant-free")).resolves.toBeUndefined();
  });
});
