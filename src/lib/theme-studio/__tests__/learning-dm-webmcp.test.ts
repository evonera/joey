import { describe, it, expect } from "vitest";
import { calculateQualityScore } from "@/lib/theme-studio/learning/quality-scorer";
import { hasUsableAnalyticsSample } from "@/lib/theme-studio/learning/recipe-optimizer";
import { createThemeStudioWebMcpTools } from "@/lib/theme-studio/webmcp/theme-studio-tools";

describe("Theme Studio Learning Loop, DM Automation & WebMCP (Phase 6)", () => {
  describe("Algorithmic Quality Scorer", () => {
    it("heavily weights saves and shares over likes based on 2025/2026 ranking signals", () => {
      // Post A: Viral saves and shares with moderate likes
      const postA = calculateQualityScore({
        saves: 100, // 100 * 5 = 500
        shares: 50,  // 50 * 6 = 300
        comments: 20, // 20 * 3 = 60
        likes: 50,   // 50 * 0.5 = 25
        reach: 5000, // 5000 * 0.02 = 100
      });

      // Post B: High vanity likes but zero saves or shares
      const postB = calculateQualityScore({
        saves: 0,
        shares: 0,
        comments: 5,
        likes: 1000, // 1000 * 0.5 = 500
        reach: 5000,
      });

      expect(postA.score).toBeGreaterThan(postB.score);
      expect(postA.signals.saveScore).toBe(500);
      expect(postA.signals.shareScore).toBe(300);
    });

    it("applies unfollow penalty accurately", () => {
      const postWithChurn = calculateQualityScore({
        saves: 10,
        shares: 10,
        comments: 5,
        likes: 50,
        reach: 1000,
        unfollows: 10, // 10 * 10 = 100 penalty
      });

      expect(postWithChurn.signals.unfollowPenalty).toBe(100);
    });

    it("excludes publishing metadata and accepts real zero-valued analytics", () => {
      expect(hasUsableAnalyticsSample({})).toBe(false);
      expect(hasUsableAnalyticsSample({ zernioPostId: "post-1", publishAccountId: "account-1" })).toBe(false);
      expect(hasUsableAnalyticsSample({ reach: 0, likes: 0 })).toBe(true);
      expect(hasUsableAnalyticsSample({ reach: Number.NaN })).toBe(false);
    });
  });

  describe("WebMCP Tool Definitions", () => {
    it("exports registered, page-scoped read-only tools", () => {
      const tools = createThemeStudioWebMcpTools(() => ({
        page: {
          id: "page-1",
          name: "Basketball Daily",
          niche: "NBA",
          audience: "Basketball fans",
          status: "draft",
          rightsPolicy: "strict",
          connectedAccountCount: 1,
        },
        sources: [{ id: "source-1", name: "Official feed", sourceType: "rss", rightsCategory: "cc_by", isActive: true }],
        slots: [{ id: "slot-1", label: "Morning card", cadence: "daily", isActive: true }],
        packages: [],
      }));
      const toolNames = tools.map((tool) => tool.name);

      expect(toolNames).toContain("theme_studio_inspect_page");
      expect(toolNames).toContain("theme_studio_check_readiness");
      expect(toolNames).not.toContain("theme_studio_approve_package");

      for (const tool of tools) {
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.execute).toBe("function");
      }
    });
  });
});
