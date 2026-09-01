import { describe, it, expect } from "vitest";
import { renderCardSvg, renderCarouselSlideSvgs } from "@/lib/theme-studio/renderers/static-card-renderer";
import { generateWordTimestamps, buildVerticalNewsComposition } from "@/lib/theme-studio/renderers/video-renderer";
import { shouldRetryFailedRender } from "@/lib/theme-studio/pipeline/orchestrator";

describe("Theme Studio Media Renderers (Phase 4)", () => {
  describe("Render recovery", () => {
    it("retries transient unrendered packages without retrying completed or unsupported video renders", () => {
      expect(shouldRetryFailedRender([], { failurePhase: "render" })).toBe(true);
      expect(shouldRetryFailedRender([{ url: "https://cdn.example.com/card.png" }], { failurePhase: "render" })).toBe(false);
      expect(shouldRetryFailedRender([], { failurePhase: "render_unsupported" })).toBe(false);
      expect(shouldRetryFailedRender([], { failurePhase: "publish" })).toBe(false);
    });
  });

  describe("Static Card Renderer", () => {
    it("renders valid SVG card with custom brand kit and typography", () => {
      const svg = renderCardSvg({
        title: "Anthropic Releases Claude 3.7 Sonnet with Hybrid Reasoning",
        body: "A deep dive into how simultaneous fast response and deep thinking mode works.",
        tag: "BREAKING",
        sourceName: "TechCrunch",
        brandKit: {
          primaryColor: "#030712",
          accentColor: "#f59e0b",
          textColor: "#ffffff",
          watermark: "@AIEngineerDaily",
        },
        aspectRatio: "1:1",
      });

      expect(svg).toContain("<svg");
      expect(svg).toContain('width="1080"');
      expect(svg).toContain('height="1080"');
      expect(svg).toContain("Anthropic Releases");
      expect(svg).toContain("Claude 3.7");
      expect(svg).toContain("BREAKING");
      expect(svg).toContain("@AIEngineerDaily");
      expect(svg).toContain("#f59e0b");
    });

    it("renders 4:5 portrait card dimensions correctly", () => {
      const svg = renderCardSvg({
        title: "Portrait Instagram Card",
        aspectRatio: "4:5",
      });

      expect(svg).toContain('width="1080"');
      expect(svg).toContain('height="1350"');
    });

    it("renders 9:16 vertical card dimensions correctly without collapsing to square", () => {
      const svg = renderCardSvg({
        title: "Vertical Story Card",
        aspectRatio: "9:16",
      });

      expect(svg).toContain('width="1080"');
      expect(svg).toContain('height="1920"');
    });

    it("clamps exceptionally long titles to prevent canvas overflow and footer collision", () => {
      const extremelyLongTitle = "A Very Long Comprehensive Analytical Headline Exploring Emerging AI Architectures and Infrastructure Shifts in Modern Production Environments";
      const svg = renderCardSvg({
        title: extremelyLongTitle,
        aspectRatio: "1:1",
      });

      expect(svg).toContain("<svg");
      expect(svg).toContain("...");
    });

    it("splits long unbroken tokens like URLs without exceeding max characters per line", () => {
      const longUrlTitle = "https://verylongdomainname.com/super/unbroken/path/that/would/normally/overflow/the/entire/card/canvas/width";
      const svg = renderCardSvg({
        title: longUrlTitle,
        aspectRatio: "1:1",
      });

      expect(svg).toContain("<svg");
      expect(svg).toContain("https://verylongdomainna");
    });

    it("handles long unbroken emoji and Unicode strings without surrogate pair corruption", () => {
      const emojiHeadline = "🚀".repeat(35);
      const svg = renderCardSvg({
        title: emojiHeadline,
        aspectRatio: "1:1",
      });

      expect(svg).toContain("<svg");
      expect(svg).not.toContain("\uFFFD");
      expect(svg).toContain("🚀");
    });

    it("preserves complex ZWJ multi-codepoint grapheme clusters without dividing emoji sequences", () => {
      const familyEmoji = "👨‍👩‍👧‍👦";
      const unbrokenZwjString = familyEmoji.repeat(30);
      const svg = renderCardSvg({
        title: unbrokenZwjString,
        aspectRatio: "1:1",
      });

      expect(svg).toContain("<svg");
      expect(svg).not.toContain("\uFFFD");
      expect(svg).toContain("👨‍👩‍👧‍👦");
    });

    it("renders multi-slide carousel sequence with slide numbering indicators", () => {
      const slides = [
        { title: "Slide 1: Overview", body: "Introduction" },
        { title: "Slide 2: Strategy", body: "Detailed analysis" },
        { title: "Slide 3: Execution", body: "Action items" },
      ];

      const svgSlides = renderCarouselSlideSvgs(slides, { watermark: "@GrowthHacker" });

      expect(svgSlides).toHaveLength(3);
      expect(svgSlides[0]).toContain("1/3");
      expect(svgSlides[1]).toContain("2/3");
      expect(svgSlides[2]).toContain("3/3");
      expect(svgSlides[0]).toContain("Slide 1: Overview");
      expect(svgSlides[2]).toContain("Slide 3: Execution");
    });
  });

  describe("Video Composition & Captions Engine", () => {
    it("computes word-level timestamps and duration from narration text", () => {
      const text = "LeBron James sets the all-time scoring record with iconic fadeaway jumper";
      const { durationSeconds, totalFrames, words } = generateWordTimestamps(text, 0, 150, 30);

      expect(words).toHaveLength(11);
      expect(words[0].word).toBe("LeBron");
      expect(words[0].startFrame).toBe(0);
      expect(words[0].endFrame).toBeGreaterThan(0);
      expect(durationSeconds).toBeGreaterThan(0);
      expect(totalFrames).toBe(words[words.length - 1].endFrame);
    });

    it("constructs vertical short video composition spec with hook, points, and CTA", () => {
      const comp = buildVerticalNewsComposition({
        title: "3 Surprising Productivity Hacks",
        points: ["Timeboxing in 90-minute blocks", "Zero-notification mornings"],
        ctaKeyword: "FOCUS",
        brandKit: { primaryColor: "#1e1b4b", accentColor: "#a855f7", watermark: "@ProductivityDaily" },
      });

      expect(comp.scenes).toHaveLength(4); // hook + 2 points + cta
      expect(comp.scenes[0].type).toBe("hook");
      expect(comp.scenes[1].type).toBe("point");
      expect(comp.scenes[2].type).toBe("point");
      expect(comp.scenes[3].type).toBe("cta");
      expect(comp.scenes[3].narrationText).toContain("FOCUS");
      expect(comp.brandKit?.watermark).toBe("@ProductivityDaily");
    });
  });
});
