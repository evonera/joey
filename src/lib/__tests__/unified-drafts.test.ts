import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getActiveTenantId: vi.fn().mockResolvedValue("tenant_123"),
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/app/actions/theme-packages", () => ({
  reviewThemePackage: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ id: "mock" }]),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ id: "mock" }]),
    })),
    query: {
      drafts: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      contentPackages: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      themePages: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
  },
}));

describe("Unified Drafts Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("federates both standard drafts and theme packages into getDrafts()", async () => {
    const { db } = await import("@/lib/db");
    const { getDrafts } = await import("@/app/actions/drafts");

    // Mock regular drafts
    (db.query.drafts.findMany as any).mockResolvedValue([
      {
        id: "draft_1",
        tenantId: "tenant_123",
        content: "Manual composer draft",
        status: "pending_review",
        platformOptions: { platform: "x", source: "compose" },
        scheduledFor: null,
        errorMessage: null,
        createdAt: new Date("2026-09-06T10:00:00Z"),
      },
    ]);

    // Mock theme studio content packages
    (db.query.contentPackages.findMany as any).mockResolvedValue([
      {
        id: "pkg_1",
        tenantId: "tenant_123",
        themePageId: "theme_page_1",
        title: "AI Trends Daily",
        caption: "Top 3 takeaways from today's research.",
        renderedAssetUrls: ["https://r2.joey.dev/card1.png"],
        status: "pending_review",
        scheduledFor: null,
        error: null,
        createdAt: new Date("2026-09-06T11:00:00Z"),
      },
    ]);

    // Mock theme pages lookup
    (db.query.themePages.findMany as any).mockResolvedValue([
      { id: "theme_page_1", name: "Tech Trends" },
    ]);

    const res = await getDrafts();
    expect(res.drafts).toBeDefined();
    expect(res.drafts?.length).toBe(2);

    // Newest first (pkg_1 at 11:00 before draft_1 at 10:00)
    expect(res.drafts?.[0].id).toBe("pkg_1");
    expect(res.drafts?.[0].platformOptions.source).toBe("theme_studio");
    expect(res.drafts?.[0].platformOptions.isThemePackage).toBe(true);
    expect(res.drafts?.[0].platformOptions.themePageName).toBe("Tech Trends");
    expect(res.drafts?.[0].platformOptions.mediaUrls).toEqual(["https://r2.joey.dev/card1.png"]);

    expect(res.drafts?.[1].id).toBe("draft_1");
    expect(res.drafts?.[1].platformOptions.source).toBe("compose");
  });

  it("filters by source correctly when requesting only theme_studio", async () => {
    const { db } = await import("@/lib/db");
    const { getDrafts } = await import("@/app/actions/drafts");

    (db.query.drafts.findMany as any).mockResolvedValue([]);
    (db.query.contentPackages.findMany as any).mockResolvedValue([
      {
        id: "pkg_1",
        tenantId: "tenant_123",
        themePageId: "theme_page_1",
        title: "AI Trends Daily",
        caption: "Summary",
        renderedAssetUrls: [],
        status: "pending_review",
        scheduledFor: null,
        error: null,
        createdAt: new Date("2026-09-06T11:00:00Z"),
      },
    ]);
    (db.query.themePages.findMany as any).mockResolvedValue([
      { id: "theme_page_1", name: "Tech Trends" },
    ]);

    const res = await getDrafts("all", "all", undefined, "theme_studio");
    expect(res.drafts?.length).toBe(1);
    expect(res.drafts?.[0].platformOptions.source).toBe("theme_studio");
  });

  it("aggregates pending counts across both drafts and content packages", async () => {
    const { db } = await import("@/lib/db");
    const { getPendingDraftCount } = await import("@/app/actions/drafts");

    (db.query.drafts.findMany as any).mockResolvedValue([
      { id: "d1" },
      { id: "d2" },
    ]);
    (db.query.contentPackages.findMany as any).mockResolvedValue([
      { id: "pkg1" },
      { id: "pkg2" },
      { id: "pkg3" },
    ]);

    const res = await getPendingDraftCount();
    expect(res.count).toBe(5);
  });

  it("aggregates status counts across both drafts and content packages in getDraftCounts", async () => {
    const { db } = await import("@/lib/db");
    const { getDraftCounts } = await import("@/app/actions/drafts");

    (db.query.drafts.findMany as any).mockResolvedValue([
      { id: "d1", status: "pending_review", scheduledFor: null },
      { id: "d2", status: "approved", scheduledFor: new Date("2026-09-07T10:00:00Z") },
    ]);
    (db.query.contentPackages.findMany as any).mockResolvedValue([
      { id: "pkg1", status: "pending_review", scheduledFor: null },
      { id: "pkg2", status: "approved", scheduledFor: null },
      { id: "pkg3", status: "published", scheduledFor: null },
    ]);

    const res = await getDraftCounts();
    expect(res.counts.all).toBe(5);
    expect(res.counts.pending_review).toBe(2);
    expect(res.counts.scheduled).toBe(1);
    expect(res.counts.approved).toBe(1);
    expect(res.counts.published).toBe(1);
  });

  it("polymorphically routes approveDraft for a content package to reviewThemePackage", async () => {
    const { db } = await import("@/lib/db");
    const { reviewThemePackage } = await import("@/app/actions/theme-packages");
    const { approveDraft } = await import("@/app/actions/drafts");

    // Not in drafts table
    (db.query.drafts.findFirst as any).mockResolvedValue(null);
    // Found in contentPackages table
    (db.query.contentPackages.findFirst as any).mockResolvedValue({
      id: "pkg_123",
      tenantId: "tenant_123",
      status: "pending_review",
    });
    (reviewThemePackage as any).mockResolvedValue({ package: { id: "pkg_123", status: "approved" } });

    const res = await approveDraft("pkg_123");
    expect(reviewThemePackage).toHaveBeenCalledWith("pkg_123", "approve");
    expect(res.success).toBe(true);
  });

  it("polymorphically routes rejectDraft for a content package to reviewThemePackage", async () => {
    const { db } = await import("@/lib/db");
    const { reviewThemePackage } = await import("@/app/actions/theme-packages");
    const { rejectDraft } = await import("@/app/actions/drafts");

    (db.query.drafts.findFirst as any).mockResolvedValue(null);
    (db.query.contentPackages.findFirst as any).mockResolvedValue({
      id: "pkg_123",
      tenantId: "tenant_123",
      status: "pending_review",
    });
    (reviewThemePackage as any).mockResolvedValue({ package: { id: "pkg_123", status: "rejected" } });

    const res = await rejectDraft("pkg_123", "Visual card needs higher contrast");
    expect(reviewThemePackage).toHaveBeenCalledWith("pkg_123", "reject");
    expect(res.success).toBe(true);
  });
});
