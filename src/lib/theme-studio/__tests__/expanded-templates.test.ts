import { describe, it, expect } from "vitest";
import { renderTweetCardSvg } from "@/lib/theme-studio/renderers/tweet-card-renderer";
import { renderVideoReelSvg } from "@/lib/theme-studio/renderers/video-reel-renderer";
import { renderCardSvg } from "@/lib/theme-studio/renderers/static-card-renderer";
import { 
  getCuratedMemeClips, 
  getMemeClipById, 
  getClipsByCategory, 
  searchMemeClips 
} from "@/lib/theme-studio/assets/meme-clips";

describe("Expanded Viral Templates & Meme Clips Suite", () => {
  describe("Meme Video Clip Registry", () => {
    it("returns curated meme clips with required video metadata", () => {
      const clips = getCuratedMemeClips();
      expect(clips.length).toBeGreaterThanOrEqual(6);

      const homelander = getMemeClipById("homelander_stare");
      expect(homelander).toBeDefined();
      expect(homelander?.category).toBe("reaction");
      expect(homelander?.videoUrl).toMatch(/^https:\/\//);
      expect(homelander?.thumbnailUrl).toMatch(/^https:\/\//);

      const subwaySurfers = getMemeClipById("subway_surfers_loop");
      expect(subwaySurfers).toBeDefined();
      expect(subwaySurfers?.aspectRatio).toBe("9:16");
      expect(subwaySurfers?.category).toBe("gaming_loop");
    });

    it("filters clips by category and searches by title/tag", () => {
      const gamingLoops = getClipsByCategory("gaming_loop");
      expect(gamingLoops.length).toBeGreaterThanOrEqual(3);
      expect(gamingLoops.every((c) => c.category === "gaming_loop")).toBe(true);

      const pedroResults = searchMemeClips("Pedro Pascal");
      expect(pedroResults.length).toBe(1);
      expect(pedroResults[0].id).toBe("pedro_pascal_laughing_crying");

      const parkourResults = searchMemeClips("parkour");
      expect(parkourResults.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Twitter / X Card Renderer", () => {
    it("renders single post with verified badge and author details", () => {
      const svg = renderTweetCardSvg({
        author: {
          name: "Daily Loud",
          handle: "@DailyLoud",
          avatarUrl: "https://example.com/avatar.jpg",
          isVerified: true,
        },
        content: "Autonomous social platforms are setting unprecedented engagement benchmarks in 2026.",
        mediaUrls: ["https://example.com/photo.jpg"],
        mediaLayout: "single",
        aspectRatio: "4:5",
      });

      expect(svg).toContain("<svg");
      expect(svg).toContain('width="1080"');
      expect(svg).toContain('height="1350"');
      expect(svg).toContain("Daily Loud");
      expect(svg).toContain("@DailyLoud");
      expect(svg).toContain("#1d9bf0"); // Blue verified checkmark
      expect(svg).toContain("https://example.com/photo.jpg");
    });

    it("renders 4-grid collage and stacked quoted tweet reply", () => {
      const svg = renderTweetCardSvg({
        author: {
          name: "Pop Culture",
          handle: "popculture",
          isVerified: true,
        },
        content: "Which legendary performance from this decade would you choose?",
        mediaUrls: [
          "https://example.com/1.jpg",
          "https://example.com/2.jpg",
          "https://example.com/3.jpg",
          "https://example.com/4.jpg",
        ],
        mediaLayout: "4-grid",
        quotedTweet: {
          author: {
            name: "Film Critic",
            handle: "@filmcritic",
            isVerified: true,
          },
          content: "Option 3 without hesitation, absolute masterclass in restraint.",
        },
        aspectRatio: "4:5",
      });

      expect(svg).toContain("grid4_top_left");
      expect(svg).toContain("grid4_bottom_right");
      expect(svg).toContain("https://example.com/1.jpg");
      expect(svg).toContain("https://example.com/4.jpg");
      expect(svg).toContain("Film Critic");
      expect(svg).toContain("@filmcritic");
      expect(svg).toContain("Option 3 without hesitation");
    });

    it("renders 2-column side-by-side comparison", () => {
      const svg = renderTweetCardSvg({
        author: {
          name: "Comparison Desk",
          handle: "@vs_desk",
        },
        content: "Coyote vs Roadrunner live test comparison.",
        mediaUrls: [
          "https://example.com/coyote.jpg",
          "https://example.com/roadrunner.jpg",
        ],
        mediaLayout: "2-column",
      });

      expect(svg).toContain("grid2_left");
      expect(svg).toContain("grid2_right");
      expect(svg).toContain("https://example.com/coyote.jpg");
      expect(svg).toContain("https://example.com/roadrunner.jpg");
    });
  });

  describe("Vertical 9:16 Video Meme Reel Renderer", () => {
    it("renders 9:16 vertical reel frame with top hook and audio indicator", () => {
      const svg = renderVideoReelSvg({
        hookText: "They were really filming scenes like this with zero CGI in mind...",
        posterUrl: "https://example.com/poster.jpg",
        videoUrl: "https://example.com/video.mp4",
        audioIndicator: true,
        brandKit: {
          watermark: "@JoeyReels",
          accentColor: "#ffe633",
        },
      });

      expect(svg).toContain("<svg");
      expect(svg).toContain('width="1080"');
      expect(svg).toContain('height="1920"');
      expect(svg).toContain("They were really filming");
      expect(svg).toContain("scenes like this with zero");
      expect(svg).toContain("https://example.com/poster.jpg");
      expect(svg).toContain("AUDIO");
      expect(svg).toContain("@JoeyReels");
    });

    it("renders streamer news header badge when account is provided", () => {
      const svg = renderVideoReelSvg({
        hookText: "Kai Cenat reacts to the viral moment on stream",
        account: {
          name: "Streamer Headquarters",
          handle: "@streamer_hq",
          isVerified: true,
        },
        layout: "streamer_news",
      });

      expect(svg).toContain("Streamer Headquarters");
      expect(svg).toContain("@streamer_hq");
      expect(svg).toContain("#1d9bf0");
      expect(svg).toContain("Kai Cenat reacts");
    });
  });

  describe("Morning Brew Cyan Edition & Carousel Outro", () => {
    it("renders Morning Brew Cyan format with — M — divider and circular seal", () => {
      const svg = renderCardSvg({
        title: "Lovable Coyote and Urban Bear Spotted in National Suburban Migration",
        tag: "OFFICIAL REPORT",
        topBadge: "circular_seal",
        showDividerMark: true,
        highlightWords: ["COYOTE", "BEAR", "URBAN", "LOVABLE"],
        brandKit: {
          accentColor: "#00e5ff",
          logoMonogram: "M",
          templatePreset: "morning_brew_cyan",
          watermark: "@UrbanWildWatch",
        },
        aspectRatio: "4:5",
      });

      expect(svg).toContain('width="1080"');
      expect(svg).toContain('height="1350"');
      expect(svg).toContain("#00e5ff"); // Electric cyan
      expect(svg).toContain("OFFICIAL");
      expect(svg).toContain("REPORT");
      expect(svg).toContain("M");
      expect(svg).toContain("@UrbanWildWatch");
    });

    it("renders carousel outro slide with massive watermark backdrop", () => {
      const svg = renderCardSvg({
        title: "Follow For Daily Breaking Stories",
        isOutroSlide: true,
        outroWatermarkText: "PUBITY",
        slideNumber: 4,
        totalSlides: 4,
        aspectRatio: "4:5",
      });

      expect(svg).toContain("PUBITY");
      expect(svg).toContain("4/4");
      expect(svg).toContain("Follow For Daily");
      expect(svg).toContain("Breaking Stories");
    });
  });
});
