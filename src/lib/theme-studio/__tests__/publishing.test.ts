import { describe, it, expect } from "vitest";
import { adaptPackageForPlatform } from "@/lib/theme-studio/publishing/variant-adapter";

describe("Theme Studio Multi-Platform Publishing (Phase 5)", () => {
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

    it("does not relabel an image as a TikTok video", () => {
      const ttVariant = adaptPackageForPlatform(mockPackage, "tiktok", "image");
      expect(ttVariant.mediaType).toBe("image");
    });
  });
});
