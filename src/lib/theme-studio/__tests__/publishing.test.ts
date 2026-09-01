import { describe, it, expect } from "vitest";
import { InstagramProvider } from "@/lib/theme-studio/publishing/providers/instagram-provider";
import { TikTokProvider } from "@/lib/theme-studio/publishing/providers/tiktok-provider";
import { XProvider } from "@/lib/theme-studio/publishing/providers/x-provider";
import { adaptPackageForPlatform } from "@/lib/theme-studio/publishing/variant-adapter";

describe("Theme Studio Multi-Platform Publishing (Phase 5)", () => {
  describe("Platform Limits & Validation", () => {
    it("InstagramProvider enforces caption length and media counts", () => {
      const ig = new InstagramProvider();
      const limits = ig.getLimits();

      expect(limits.maxCaptionLength).toBe(2200);
      expect(limits.maxCarouselSlides).toBe(10);

      const validCheck = ig.validateContent("Valid caption for Instagram", ["https://r2.dev/slide1.png"], "image");
      expect(validCheck.valid).toBe(true);

      const invalidLength = ig.validateContent("a".repeat(2300), ["https://r2.dev/slide1.png"], "image");
      expect(invalidLength.valid).toBe(false);
      expect(invalidLength.errors[0]).toContain("exceeds Instagram limit");

      const excessCarousel = ig.validateContent(
        "Carousel caption",
        Array.from({ length: 12 }, (_, i) => `https://r2.dev/s${i}.png`),
        "carousel"
      );
      expect(excessCarousel.valid).toBe(false);
      expect(excessCarousel.errors[0]).toContain("exceeds Instagram max of 10 slides");
    });

    it("XProvider enforces 280 character limit and max 4 images", () => {
      const x = new XProvider();
      const limits = x.getLimits();

      expect(limits.maxCaptionLength).toBe(280);
      expect(limits.maxCarouselSlides).toBe(4);

      const invalidX = x.validateContent("a".repeat(290), ["https://r2.dev/img.png"], "image");
      expect(invalidX.valid).toBe(false);
      expect(invalidX.errors[0]).toContain("exceeds X limit of 280 characters");
    });

    it("TikTokProvider enforces vertical short video format", () => {
      const tiktok = new TikTokProvider();
      const nonVideoCheck = tiktok.validateContent("Check this out", ["https://r2.dev/img.png"], "image");
      expect(nonVideoCheck.valid).toBe(false);
      expect(nonVideoCheck.errors[0]).toContain("requires vertical short video media");
    });
  });

  describe("3-Step Async Publishing Container Lifecycle", () => {
    it("completes container creation, polling, and finalization on InstagramProvider", async () => {
      const ig = new InstagramProvider();
      const mockCreds = {
        accountId: "acc_123",
        platform: "instagram",
        accessToken: "test_token",
      };

      // Step 1: Create Container
      const container = await ig.createMediaContainer(mockCreds, ["https://r2.dev/card.png"], "image");
      expect(container.containerId).toBeDefined();
      expect(container.status).toBe("READY");

      // Step 2: Poll Container
      const polled = await ig.pollContainerStatus(mockCreds, container.containerId);
      expect(polled.status).toBe("READY");

      // Step 3: Finalize Publish
      const finalized = await ig.finalizePublish(mockCreds, container.containerId, "Official Published Post");
      expect(finalized.success).toBe(true);
      expect(finalized.publishedPostId).toBeDefined();
      expect(finalized.publishedUrl).toContain("instagram.com/p/");
    });
  });

  describe("Platform Variant Adapter", () => {
    const mockPackage = {
      title: "AI Breakout Models Reshaping Autonomous Coding Workflows in 2026",
      caption: "A comprehensive breakdown of multi-agent coordination, deterministic code execution, and high-velocity shipping cycles.",
      hashtags: ["#ai", "#coding", "#engineering", "#build", "#tech"],
      renderedAssetUrls: [
        { url: "https://r2.dev/s1.png" },
        { url: "https://r2.dev/s2.png" },
        { url: "https://r2.dev/s3.png" },
      ],
    };

    it("adapts package into concise, truncated format for X within 280 chars", () => {
      const xVariant = adaptPackageForPlatform(mockPackage, "x", "carousel");

      expect(xVariant.platform).toBe("x");
      expect(xVariant.adaptedCaption.length).toBeLessThanOrEqual(280);
      expect(xVariant.adaptedHashtags).toHaveLength(2);
      expect(xVariant.mediaUrls).toHaveLength(3);
    });

    it("adapts package into swipe-cued carousel format for Instagram", () => {
      const igVariant = adaptPackageForPlatform(mockPackage, "instagram", "carousel");

      expect(igVariant.platform).toBe("instagram");
      expect(igVariant.adaptedCaption).toContain("👉 Swipe left for the breakdown.");
      expect(igVariant.adaptedCaption).toContain("#ai #coding #engineering");
      expect(igVariant.mediaUrls).toHaveLength(3);
    });

    it("adapts package into video CTA format for TikTok", () => {
      const ttVariant = adaptPackageForPlatform(mockPackage, "tiktok", "video");

      expect(ttVariant.platform).toBe("tiktok");
      expect(ttVariant.adaptedCaption).toContain("Comment below to get the full guide.");
      expect(ttVariant.adaptedHashtags).toHaveLength(5);
    });
  });
});
