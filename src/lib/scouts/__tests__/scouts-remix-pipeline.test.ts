import { describe, expect, it, vi, beforeEach } from "vitest";
import { remixScoutAlertToThemeStudio } from "../remix-pipeline";

const mockFindFirstScout = vi.fn();
const mockFindFirstThemePage = vi.fn();
const mockFindFirstFormat = vi.fn();
const mockFindFirstTemplate = vi.fn();
const mockFindFirstSlot = vi.fn();
const mockInsertCluster = vi.fn();
const mockInsertPackage = vi.fn();
const mockSearchWithExa = vi.fn();
const mockRenderPackageMedia = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      scouts: {
        findFirst: (...args: any[]) => mockFindFirstScout(...args),
      },
      themePages: {
        findFirst: (...args: any[]) => mockFindFirstThemePage(...args),
      },
      themeContentFormats: {
        findFirst: (...args: any[]) => mockFindFirstFormat(...args),
      },
      themeVisualTemplates: {
        findFirst: (...args: any[]) => mockFindFirstTemplate(...args),
      },
      themeSlots: {
        findFirst: (...args: any[]) => mockFindFirstSlot(...args),
      },
    },
    insert: (table: any) => ({
      values: (val: any) => ({
        returning: vi.fn().mockImplementation(() => {
          if (val.themePageId && val.freshnessScore) {
            mockInsertCluster(val);
            return [{ id: "cluster-remix-1", ...val }];
          }
          if (val.formatId) {
            mockInsertPackage(val);
            return [{ id: "pkg-remix-1", ...val }];
          }
          return [{ id: "res-1", ...val }];
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/search/exa-client", () => ({
  searchWithExa: (...args: any[]) => mockSearchWithExa(...args),
}));

vi.mock("@/lib/theme-studio/renderers/media-assembler", () => ({
  renderPackageMedia: (...args: any[]) => mockRenderPackageMedia(...args),
}));

describe("Scout -> Exa -> Theme Studio Remix Action Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error if scout is not found or has no active alert", async () => {
    mockFindFirstScout.mockResolvedValueOnce(null);

    const res = await remixScoutAlertToThemeStudio({
      tenantId: "tenant-1",
      scoutId: "non-existent",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("Scout not found");
  });

  it("returns error if no active Theme Page exists for workspace", async () => {
    mockFindFirstScout.mockResolvedValueOnce({
      id: "scout-1",
      tenantId: "tenant-1",
      name: "Pubity",
      latestAlert: {
        title: "Pubity posted viral story",
        samplePost: { content: "Breaking: Major trade agreed" },
      },
    });
    mockFindFirstThemePage.mockResolvedValueOnce(null);

    const res = await remixScoutAlertToThemeStudio({
      tenantId: "tenant-1",
      scoutId: "scout-1",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("No active Theme Page found");
  });

  it("researches story via Exa, creates Theme Studio cluster and renders branded draft package", async () => {
    mockFindFirstScout.mockResolvedValueOnce({
      id: "scout-pubity-1",
      tenantId: "tenant-1",
      name: "Pubity Entertainment",
      targetUrl: "https://instagram.com/pubity",
      latestAlert: {
        title: "Viral Spike: Kawhi Leonard trade",
        samplePost: {
          url: "https://instagram.com/p/viral-pubity",
          content: "Stop scrolling: Kawhi Leonard is returning to Toronto Raptors in a blockbuster trade deal!",
          views: 350000,
          likes: 42000,
        },
        actionPayload: {
          type: "remix_theme_studio",
          topicQuery: "Kawhi Leonard returning to Toronto Raptors trade deal",
        },
      },
    });

    mockFindFirstThemePage.mockResolvedValueOnce({
      id: "page-nba-1",
      tenantId: "tenant-1",
      name: "Hoops Nation",
      niche: "NBA Basketball",
      voice: "Informative and high energy",
    });

    mockFindFirstFormat.mockResolvedValueOnce({
      id: "format-card-1",
      mediaType: "image",
    });

    mockFindFirstTemplate.mockResolvedValueOnce({
      id: "template-pubity-card",
      name: "News Card",
    });

    mockSearchWithExa.mockResolvedValueOnce({
      results: [
        {
          id: "exa-art-1",
          title: "Kawhi Leonard traded to Toronto Raptors in blockbuster deal",
          url: "https://espn.com/nba/story/kawhi-trade",
          heroImage: "https://images.example.com/kawhi-toronto.jpg",
          highlights: ["The Toronto Raptors have agreed to acquire forward Kawhi Leonard from the LA Clippers."],
        },
        {
          id: "exa-art-2",
          title: "Raptors send Ingram, Dick, and draft capital for Kawhi Leonard",
          url: "https://sportsnet.ca/nba/raptors-kawhi",
          highlights: ["Multiple unprotected first-round picks head to Los Angeles."],
        },
      ],
      images: ["https://images.example.com/kawhi-toronto.jpg"],
    });

    mockRenderPackageMedia.mockResolvedValueOnce({
      packageId: "pkg-remix-1",
      mediaType: "image",
      renderedUrls: [{ url: "https://r2.example.com/rendered-card.png", type: "image/png" }],
      success: true,
    });

    const res = await remixScoutAlertToThemeStudio({
      tenantId: "tenant-1",
      scoutId: "scout-pubity-1",
    });

    expect(res.success).toBe(true);
    expect(res.packageId).toBe("pkg-remix-1");
    expect(res.clusterId).toBe("cluster-remix-1");
    expect(res.status).toBe("pending_review");
    expect(res.renderedUrls).toHaveLength(1);

    // Verify Exa search query was cleaned
    expect(mockSearchWithExa).toHaveBeenCalledTimes(1);
    const searchArgs = mockSearchWithExa.mock.calls[0][0];
    expect(searchArgs.query).toBe("Kawhi Leonard returning to Toronto Raptors trade deal");

    // Verify Theme Studio cluster was inserted
    expect(mockInsertCluster).toHaveBeenCalledTimes(1);
    const clusterArgs = mockInsertCluster.mock.calls[0][0];
    expect(clusterArgs.themePageId).toBe("page-nba-1");
    expect(clusterArgs.facts).toHaveLength(2);

    // Verify Content Package was inserted with heroImage in provenance
    expect(mockInsertPackage).toHaveBeenCalledTimes(1);
    const pkgArgs = mockInsertPackage.mock.calls[0][0];
    expect(pkgArgs.status).toBe("pending_review");
    expect(pkgArgs.provenance.heroImage).toBe("https://images.example.com/kawhi-toronto.jpg");
    expect(pkgArgs.provenance.scoutId).toBe("scout-pubity-1");

    // Verify media card renderer was invoked
    expect(mockRenderPackageMedia).toHaveBeenCalledTimes(1);
  });

  it("returns error if Exa research yields 0 results", async () => {
    mockFindFirstScout.mockResolvedValueOnce({
      id: "scout-1",
      tenantId: "tenant-1",
      name: "TechScout",
      latestAlert: {
        title: "Obscure rumor",
        samplePost: { content: "Unverifiable rumor about tech startup" },
      },
    });

    mockFindFirstThemePage.mockResolvedValueOnce({
      id: "page-1",
      tenantId: "tenant-1",
      status: "active",
    });

    mockSearchWithExa.mockResolvedValueOnce({
      results: [],
      images: [],
    });

    const res = await remixScoutAlertToThemeStudio({
      tenantId: "tenant-1",
      scoutId: "scout-1",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("Exa research could not find verified source stories or facts for this topic.");
  });

  it("returns error if no content format is configured for the workspace", async () => {
    mockFindFirstScout.mockResolvedValueOnce({
      id: "scout-1",
      tenantId: "tenant-1",
      name: "TechScout",
      latestAlert: {
        title: "Confirmed scoop",
        samplePost: { content: "Verified tech news" },
      },
    });

    mockFindFirstThemePage.mockResolvedValueOnce({
      id: "page-1",
      tenantId: "tenant-1",
      status: "active",
    });

    mockSearchWithExa.mockResolvedValueOnce({
      results: [{ title: "Verified tech news", url: "https://example.com/news" }],
      images: [],
    });

    mockFindFirstSlot.mockResolvedValueOnce(null);
    mockFindFirstFormat.mockResolvedValueOnce(null);

    const res = await remixScoutAlertToThemeStudio({
      tenantId: "tenant-1",
      scoutId: "scout-1",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("No active content format found for this workspace. Please configure a format first.");
  });

  it("returns error if media rendering produces empty URLs or throws", async () => {
    mockFindFirstScout.mockResolvedValueOnce({
      id: "scout-1",
      tenantId: "tenant-1",
      name: "TechScout",
      latestAlert: {
        title: "Breaking announcement",
        samplePost: { content: "Breaking news story" },
      },
    });

    mockFindFirstThemePage.mockResolvedValueOnce({
      id: "page-1",
      tenantId: "tenant-1",
      status: "active",
    });

    mockSearchWithExa.mockResolvedValueOnce({
      results: [{ title: "Breaking news story", url: "https://example.com/breaking" }],
      images: [],
    });

    mockFindFirstSlot.mockResolvedValueOnce(null);
    mockFindFirstFormat.mockResolvedValueOnce({ id: "format-1" });
    mockFindFirstTemplate.mockResolvedValueOnce({ id: "template-1" });

    // Mock rendering failure
    mockRenderPackageMedia.mockRejectedValueOnce(new Error("Browser viewport crash"));

    const res = await remixScoutAlertToThemeStudio({
      tenantId: "tenant-1",
      scoutId: "scout-1",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Media rendering failed: Browser viewport crash");
  });
});
