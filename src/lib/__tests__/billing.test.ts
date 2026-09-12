import { describe, it, expect, vi, beforeEach } from "vitest";
import { canReuseCheckoutSession, planForProductId } from "../dodo";
import { checkUsageLimits, requireProPlan, assertThemePageQuota, assertAccountQuota, assertWorkspaceQuota, isProTenant } from "../billing";

vi.mock("@/lib/db", () => {
  return {
    db: {
      query: {
        tenants: {
          findFirst: vi.fn(),
        },
        member: {
          findMany: vi.fn(),
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
    expect(limits.themePageLimit).toBe(8);
    expect(limits.maxConnectedAccounts).toBe(8);
    expect(limits.maxWorkspaces).toBe(3);
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
      "Workspace limit reached (1 theme page). Upgrade to a paid plan for more theme pages.",
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

  it("enforces social account quota (max 2 accounts) on Free tier", async () => {
    const { db } = await import("@/lib/db");
    (db.query.tenants.findFirst as any).mockResolvedValue({
      subscriptionPlan: "free",
      subscriptionStatus: "active",
    });

    // Mock count query returning 1 existing active account
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: 1 }]),
      }),
    });

    await expect(assertAccountQuota("tenant-free")).rejects.toThrow(
      "Workspace limit reached (1 connected account). Upgrade to a paid plan to connect more accounts.",
    );
  });

  it("allows social account connection when under quota", async () => {
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

    await expect(assertAccountQuota("tenant-free")).resolves.toBeUndefined();
  });

  it("enforces workspace limit (1 workspace) on Free tier", async () => {
    const { db } = await import("@/lib/db");
    (db.query.member.findMany as any).mockResolvedValue([{ organizationId: "ws-1" }]);
    (db.query.tenants.findFirst as any).mockResolvedValue({
      subscriptionPlan: "free",
      subscriptionStatus: "active",
    });

    await expect(assertWorkspaceQuota("user-free")).rejects.toThrow(
      "Workspace limit reached (1 workspace). Free accounts are limited to 1 workspace. Upgrade to Pro to create more workspaces.",
    );
  });

  it("permits additional workspaces for Pro subscribers up to limit", async () => {
    const { db } = await import("@/lib/db");
    (db.query.member.findMany as any).mockResolvedValue([{ organizationId: "ws-1" }]);
    (db.query.tenants.findFirst as any).mockResolvedValue({
      subscriptionPlan: "pro",
      subscriptionStatus: "active",
    });

    await expect(assertWorkspaceQuota("user-pro")).resolves.toBeUndefined();
  });
});

describe("Dodo hosted checkout reuse", () => {
  const now = Date.parse("2026-09-08T00:00:00Z");

  it("reuses only a recent unfinished checkout", () => {
    expect(canReuseCheckoutSession("2026-09-07T23:55:00Z", null, now)).toBe(true);
    expect(canReuseCheckoutSession("2026-09-07T23:55:00Z", "requires_payment_method", now)).toBe(true);
  });

  it("replaces stale or terminal checkout sessions", () => {
    expect(canReuseCheckoutSession("2026-09-07T23:40:00Z", null, now)).toBe(false);
    expect(canReuseCheckoutSession("2026-09-07T23:59:00Z", "failed", now)).toBe(false);
    expect(canReuseCheckoutSession("2026-09-07T23:59:00Z", "cancelled", now)).toBe(false);
    expect(canReuseCheckoutSession("2026-09-07T23:59:00Z", "succeeded", now)).toBe(false);
    expect(canReuseCheckoutSession("not-a-date", null, now)).toBe(false);
  });
});

describe("Dodo product migration", () => {
  it("continues reconciling webhook events from legacy products", () => {
    process.env.DODO_CREATOR_PRODUCT_ID = "creator-current";
    process.env.DODO_CREATOR_LEGACY_PRODUCT_IDS = "creator-old, creator-older";

    expect(planForProductId("creator-current")).toBe("creator");
    expect(planForProductId("creator-old")).toBe("creator");
    expect(planForProductId("unrelated")).toBeUndefined();

    delete process.env.DODO_CREATOR_PRODUCT_ID;
    delete process.env.DODO_CREATOR_LEGACY_PRODUCT_IDS;
  });

  it("fails closed when a product ID is configured for multiple plans", () => {
    process.env.DODO_CREATOR_PRODUCT_ID = "shared-product";
    process.env.DODO_PRO_LEGACY_PRODUCT_IDS = "shared-product";

    expect(planForProductId("shared-product")).toBeUndefined();

    delete process.env.DODO_CREATOR_PRODUCT_ID;
    delete process.env.DODO_PRO_LEGACY_PRODUCT_IDS;
  });
});
