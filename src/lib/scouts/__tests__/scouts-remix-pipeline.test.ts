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
const mockClaim = vi.fn();
const mockFinish = vi.fn();
const mockEditorial = vi.fn();
const mockExistingPackage = vi.fn();

vi.mock("../remix-receipts", () => ({
  scoutRemixEventKey: () => "event-1",
  claimScoutRemix: (...args: any[]) => mockClaim(...args),
  finishScoutRemix: (...args: any[]) => mockFinish(...args),
  saveScoutRemixDraft: async (_receipt: unknown, cluster: any, pkg: any) => {
    mockInsertCluster(cluster);
    mockInsertPackage(pkg);
    return { cluster: { id: "cluster-remix-1", ...cluster }, pkg: { id: "pkg-remix-1", ...pkg } };
  },
}));
vi.mock("../remix-research", () => ({ synthesizeScoutResearch: (...args: any[]) => mockEditorial(...args) }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      scouts: {
        findFirst: (...args: any[]) => mockFindFirstScout(...args),
      },
      contentPackages: { findFirst: (...args: any[]) => mockExistingPackage(...args) },
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
    update: () => ({ set: () => ({ where: vi.fn().mockResolvedValue([]) }) }),
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
  function primeDraft() {
    mockFindFirstScout.mockResolvedValue({
      id: "scout-1",
      targetUrl: "https://instagram.com/science",
      goalCondition: "New stories",
      latestAlert: { title: "Launch", samplePost: { content: "A research launch" } },
    });
    mockFindFirstThemePage.mockResolvedValue({ id: "page-1", tenantId: "tenant-1", name: "Science" });
    mockSearchWithExa.mockResolvedValue({
      results: [
        {
          title: "Launch",
          url: "https://science.example.com/launch",
          highlights: ["A research launch happened Monday."],
        },
      ],
      images: [],
    });
    mockFindFirstFormat.mockResolvedValue({ id: "format-1" });
    mockFindFirstTemplate.mockResolvedValue(null);
  }
  beforeEach(() => {
    vi.resetAllMocks();
    mockClaim.mockResolvedValue({
      claimed: true,
      receipt: { id: "receipt-1", tenantId: "tenant-1", leaseToken: "lease-1" },
    });
    mockEditorial.mockResolvedValue({
      title: "A fresh branded angle",
      caption: "Original evidence-grounded copy.",
      hashtags: ["#news"],
      facts: [
        { claim: "A supported claim", corroborationStatus: "corroborated" },
        { claim: "Another sourced claim", corroborationStatus: "unverified" },
      ],
      requiresFactReview: true,
    });
  });

  it("returns a successful queued receipt without pretending an MP4 is already ready", async () => {
    primeDraft();
    mockRenderPackageMedia.mockResolvedValue({ queued: true, success: false, renderedUrls: [] });
    const result = await remixScoutAlertToThemeStudio({ tenantId: "tenant-1", scoutId: "scout-1" });
    expect(result).toMatchObject({ success: true, renderState: "queued", packageId: "pkg-remix-1", renderedUrls: [] });
    expect(mockFinish).toHaveBeenCalledWith(expect.objectContaining({ id: "receipt-1" }), "queued");
  });

  it("reuses an existing draft on a duplicate scan without research, generation or rendering", async () => {
    primeDraft();
    mockClaim.mockResolvedValue({
      claimed: false,
      receipt: { status: "queued", packageId: "existing", clusterId: "cluster-1" },
    });
    mockExistingPackage.mockResolvedValue({
      id: "existing",
      title: "Existing copy",
      status: "pending_review",
      renderedAssetUrls: [],
    });
    const result = await remixScoutAlertToThemeStudio({ tenantId: "tenant-1", scoutId: "scout-1" });
    expect(result).toMatchObject({ success: true, duplicate: true, renderState: "queued", packageId: "existing" });
    expect(mockSearchWithExa).not.toHaveBeenCalled();
    expect(mockEditorial).not.toHaveBeenCalled();
    expect(mockInsertPackage).not.toHaveBeenCalled();
    expect(mockRenderPackageMedia).not.toHaveBeenCalled();
  });

  it("observes an attached output after an asynchronous render completes", async () => {
    primeDraft();
    mockClaim.mockResolvedValue({ claimed: false, receipt: { status: "queued", packageId: "existing" } });
    mockExistingPackage.mockResolvedValue({
      id: "existing",
      status: "pending_review",
      renderedAssetUrls: [{ url: "https://assets.example.com/output.mp4", type: "video" }],
    });
    expect(await remixScoutAlertToThemeStudio({ tenantId: "tenant-1", scoutId: "scout-1" })).toMatchObject({
      success: true,
      duplicate: true,
      renderState: "completed",
    });
  });

  it("does not create a draft after cancellation or a failed editorial/budget call", async () => {
    primeDraft();
    const controller = new AbortController();
    controller.abort();
    const result = await remixScoutAlertToThemeStudio({
      tenantId: "tenant-1",
      scoutId: "scout-1",
      signal: controller.signal,
    });
    expect(result.success).toBe(false);
    expect(mockEditorial).not.toHaveBeenCalled();
    expect(mockInsertPackage).not.toHaveBeenCalled();
    mockEditorial.mockRejectedValue(new Error("Monthly budget reached"));
    expect(await remixScoutAlertToThemeStudio({ tenantId: "tenant-1", scoutId: "scout-1" })).toMatchObject({
      success: false,
      error: "Monthly budget reached",
    });
    expect(mockInsertPackage).not.toHaveBeenCalled();
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
    expect(pkgArgs.provenance.heroImageReference).toBe("https://images.example.com/kawhi-toronto.jpg");
    expect(pkgArgs.provenance.heroImage).toBeUndefined();
    expect(pkgArgs.provenance.requiresFactReview).toBe(true);
    expect(pkgArgs.title).toBe("A fresh branded angle");
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
    expect(res.error).toBe("Research found no source stories for this topic.");
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
