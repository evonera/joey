import { describe, it, expect } from "vitest";
import { compileThemeRecipe } from "@/lib/flows/recipe-compiler";
import { validateGraph } from "@/lib/flows/validation";

describe("Theme Studio Recipe-to-Flow Compiler", () => {
  const mockPage = {
    id: "page_123",
    name: "NBA Daily Pulse",
    niche: "NBA basketball highlights and trade news",
    audience: "Die-hard basketball fans looking for fast, statistical analysis",
    voice: "High energy, data-driven, analytical yet fun",
    defaultRightsPolicy: "strict",
  };

  const mockSources = [
    {
      id: "src_espn",
      name: "ESPN NBA RSS",
      sourceType: "rss",
      url: "https://www.espn.com/espn/rss/nba/news",
      isActive: true,
    },
    {
      id: "src_reddit",
      name: "r/nba Subreddit",
      sourceType: "reddit",
      url: "https://reddit.com/r/nba",
      isActive: true,
    },
    {
      id: "src_theathletic",
      name: "The Athletic News API",
      sourceType: "http",
      url: "https://api.theathletic.com/v1/nba/news",
      isActive: true,
    },
    {
      id: "src_inactive",
      name: "Old Inactive Blog",
      sourceType: "rss",
      url: "https://oldblog.com/feed",
      isActive: false,
    },
  ];

  const mockSlots = [
    {
      id: "slot_morning_card",
      label: "Morning Breaking News Card",
      priority: 0,
      format: {
        slug: "instagram-card-1080",
        name: "Instagram Square Card",
        platform: "instagram",
        mediaType: "image",
      },
    },
    {
      id: "slot_recap_carousel",
      label: "Evening Recap Carousel",
      priority: 1,
      format: {
        slug: "instagram-carousel-1080",
        name: "Instagram Carousel",
        platform: "instagram",
        mediaType: "carousel",
      },
    },
  ];

  it("compiles a valid, cyclic-free FlowGraphDoc from full theme page config", () => {
    const result = compileThemeRecipe({
      page: mockPage,
      sources: mockSources,
      slots: mockSlots,
    });

    expect(result.flowName).toBe("[Theme] NBA Daily Pulse");
    expect(result.isValid).toBe(true);
    expect(result.validationIssues).toHaveLength(0);

    const { graph } = result;

    // Verify graph validation passes Joey's graph validator
    const validation = validateGraph(graph);
    expect(validation.ok).toBe(true);
    expect(validation.issues.filter((i) => i.severity === "error")).toHaveLength(0);

    // Verify trigger node exists and is unique
    const triggers = graph.nodes.filter((n) => n.type.startsWith("trigger."));
    expect(triggers).toHaveLength(1);
    expect(triggers[0].type).toBe("trigger.schedule");

    const runNode = graph.nodes.find((n) => n.type === "action.theme_studio_run");
    expect(runNode).toBeDefined();
    expect(runNode?.config.themePageId).toBe(mockPage.id);
    expect(graph.nodes).toHaveLength(2);
  });

  it("refuses activation when no trusted sources are configured", () => {
    const result = compileThemeRecipe({
      page: mockPage,
      sources: [],
      slots: mockSlots,
    });

    expect(result.isValid).toBe(false);
    expect(result.validationIssues).toContain("Add at least one active Theme Studio source.");
    const validation = validateGraph(result.graph);
    expect(validation.ok).toBe(true);
  });

  it("refuses activation when no content slots are configured", () => {
    const result = compileThemeRecipe({
      page: mockPage,
      sources: mockSources,
      slots: [],
    });

    expect(result.isValid).toBe(false);
    expect(result.validationIssues).toContain("Add at least one active Theme Studio content slot.");
    const validation = validateGraph(result.graph);
    expect(validation.ok).toBe(true);

  });

  it("fails closed while video output has no production renderer", () => {
    const result = compileThemeRecipe({
      page: mockPage,
      sources: mockSources,
      slots: [{
        id: "slot_video",
        label: "Daily reel",
        priority: 0,
        format: {
          slug: "vertical-video",
          name: "Vertical video",
          platform: "instagram",
          mediaType: "video",
        },
      }],
    });
    expect(result.isValid).toBe(false);
    expect(result.validationIssues).toContain("Remove video slots until a production MP4 renderer is configured.");
  });
});
