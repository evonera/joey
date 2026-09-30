import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pkg: vi.fn(), format: vi.fn(), template: vi.fn(), card: vi.fn(), carousel: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  query: {
    contentPackages: { findFirst: mocks.pkg },
    themePages: { findFirst: async () => ({ name: "Test", brandKit: {} }) },
    themeContentFormats: { findFirst: mocks.format },
    themeVisualTemplates: { findFirst: mocks.template },
    assets: { findFirst: async () => null },
    storyClusters: { findFirst: async () => ({ facts: [{ claim: "Supported", corroborationStatus: "corroborated" }, { claim: "Uncertain", corroborationStatus: "unverified" }] }) },
  },
  update: () => ({ set: () => ({ where: mocks.update }) }),
} }));
vi.mock("@/lib/theme-studio/renderers/static-card-renderer", () => ({ renderCardSvg: mocks.card, renderCarouselSlideSvgs: mocks.carousel }));
vi.mock("@/lib/theme-studio/renderers/rasterize-svg", () => ({ renderSvgPng: async () => Buffer.from("png") }));
vi.mock("@/lib/flows/asset-registration", () => ({ uploadAndRegisterFlowAsset: async () => ({ publicUrl: "https://assets.example.com/card.png" }) }));
vi.mock("@/lib/publisher-core", () => ({ draftStatusFromZernio: vi.fn(), getZernioClientForTenant: vi.fn() }));
import { renderPackageMedia } from "@/lib/theme-studio/renderers/media-assembler";
import { publishContentPackage } from "@/lib/theme-studio/publishing/publisher";

describe("Scout evidence-to-render safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.card.mockReturnValue("<svg/>"); mocks.carousel.mockReturnValue(["<svg/>"]);
    mocks.template.mockResolvedValue({ componentSpec: {} });
    mocks.format.mockResolvedValue({ mediaType: "image" });
    mocks.pkg.mockResolvedValue({ id: "pkg", tenantId: "tenant", themePageId: "page", formatId: "format", templateId: "template", clusterId: "cluster", title: "Original", renderedAssetUrls: [], provenance: { scoutId: "scout", sources: [{ url: "https://news.example.com/story", heroImage: "https://unlicensed.example.com/image.jpg" }], heroImage: "https://unlicensed.example.com/image.jpg", requiresFactReview: true } });
  });
  it("does not render Scout research images from legacy or new provenance", async () => {
    await renderPackageMedia("pkg", "tenant", "stable-run");
    expect(mocks.card.mock.calls[0][0].imageUrl).toBeUndefined();
  });
  it("keeps explicitly configured template media, not competitor imagery", async () => {
    mocks.template.mockResolvedValue({ componentSpec: { imageUrl: "https://assets.example.com/owned.jpg" } });
    await renderPackageMedia("pkg", "tenant", "stable-run");
    expect(mocks.card.mock.calls[0][0].imageUrl).toBe("https://assets.example.com/owned.jpg");
  });
  it("never turns an uncertain claim into a carousel takeaway", async () => {
    mocks.format.mockResolvedValue({ mediaType: "carousel" });
    await renderPackageMedia("pkg", "tenant", "stable-run");
    const slides = mocks.carousel.mock.calls[0][0];
    expect(slides.some((slide: { body: string }) => slide.body === "Supported")).toBe(true);
    expect(slides.some((slide: { body: string }) => slide.body === "Uncertain")).toBe(false);
  });
  it("blocks direct publishing while fact review is outstanding", async () => {
    const result = await publishContentPackage("pkg", "tenant");
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("fact review") });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
