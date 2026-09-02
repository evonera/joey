import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  query: {
    contentPackages: { findMany: vi.fn().mockResolvedValue([]) },
    themeSlots: { findMany: vi.fn().mockResolvedValue([]) },
    themeContentFormats: { findMany: vi.fn().mockResolvedValue([]) },
    mixRecommendations: { findFirst: vi.fn().mockResolvedValue(null) },
  },
  insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
  update: vi.fn().mockReturnValue({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/theme-studio/learning/quality-scorer", () => ({
  calculateQualityScore: vi.fn().mockReturnValue({ score: 42, signals: {} }),
}));

import {
  optimizeThemeSlotMix,
  hasUsableAnalyticsSample,
  getPendingRecommendation,
  storeMixRecommendation,
  acceptMixRecommendation,
  discardMixRecommendation,
} from "../recipe-optimizer";

describe("hasUsableAnalyticsSample", () => {
  it("returns false for null/undefined/non-object", () => {
    expect(hasUsableAnalyticsSample(null)).toBe(false);
    expect(hasUsableAnalyticsSample(undefined)).toBe(false);
    expect(hasUsableAnalyticsSample("string")).toBe(false);
    expect(hasUsableAnalyticsSample([])).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(hasUsableAnalyticsSample({})).toBe(false);
  });

  it("returns true when reach is present", () => {
    expect(hasUsableAnalyticsSample({ reach: 100 })).toBe(true);
  });

  it("returns true when likes is present", () => {
    expect(hasUsableAnalyticsSample({ likes: 5 })).toBe(true);
  });

  it("returns true when comments is present", () => {
    expect(hasUsableAnalyticsSample({ comments: 3 })).toBe(true);
  });

  it("returns true when shares is present", () => {
    expect(hasUsableAnalyticsSample({ shares: 2 })).toBe(true);
  });

  it("returns true when saves is present", () => {
    expect(hasUsableAnalyticsSample({ saves: 1 })).toBe(true);
  });
});

describe("optimizeThemeSlotMix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty adjustments when no packages exist", async () => {
    const result = await optimizeThemeSlotMix("tenant-1", "page-1");
    expect(result.adjustments).toEqual([]);
    expect(result.applied).toBe(false);
  });

  it("returns adjustments when slots exist and comparison is possible", async () => {
    mockDb.query.contentPackages.findMany.mockResolvedValue([
      { formatId: "fmt-1", metrics: { reach: 100 }, id: "pkg-1" },
      { formatId: "fmt-1", metrics: { reach: 200 }, id: "pkg-2" },
      { formatId: "fmt-1", metrics: { reach: 150 }, id: "pkg-3" },
      { formatId: "fmt-2", metrics: { reach: 300 }, id: "pkg-4" },
      { formatId: "fmt-2", metrics: { reach: 250 }, id: "pkg-5" },
      { formatId: "fmt-2", metrics: { reach: 350 }, id: "pkg-6" },
    ]);

    mockDb.query.themeSlots.findMany.mockResolvedValue([
      { id: "slot-1", formatId: "fmt-1", priority: 1, themePageId: "page-1", tenantId: "tenant-1", isActive: true },
      { id: "slot-2", formatId: "fmt-2", priority: 0, themePageId: "page-1", tenantId: "tenant-1", isActive: true },
    ]);

    mockDb.query.themeContentFormats.findMany.mockResolvedValue([
      { id: "fmt-1", name: "Card" },
      { id: "fmt-2", name: "Carousel" },
    ]);

    const result = await optimizeThemeSlotMix("tenant-1", "page-1");
    expect(result.adjustments.length).toBe(2);
    expect(result.evaluatedPackagesCount).toBe(6);
  });
});

describe("recommendation functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getPendingRecommendation returns null when none exists", async () => {
    mockDb.query.mixRecommendations.findFirst.mockResolvedValue(null);
    const result = await getPendingRecommendation("tenant-1", "page-1");
    expect(result).toBeNull();
  });

  it("storeMixRecommendation inserts a new record", async () => {
    const mockValues = vi.fn().mockResolvedValue({});
    mockDb.insert.mockReturnValue({ values: mockValues });

    const id = await storeMixRecommendation("tenant-1", {
      themePageId: "page-1",
      evaluatedPackagesCount: 5,
      formatScores: {},
      adjustments: [],
      applied: false,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockValues).toHaveBeenCalled();
  });

  it("discardMixRecommendation updates status", async () => {
    mockDb.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: vi.fn().mockResolvedValue([{ id: "rec-1" }]),
        }),
      }),
    });

    const result = await discardMixRecommendation("tenant-1", "rec-1");
    expect(result).toBe(true);
  });
});
