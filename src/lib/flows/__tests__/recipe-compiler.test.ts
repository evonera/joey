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

    // Verify active sources are included (inactive excluded)
    const sourceNodes = graph.nodes.filter((n) => n.type.startsWith("data."));
    expect(sourceNodes).toHaveLength(3); // rss, reddit, http
    expect(graph.nodes.some((n) => n.type === "data.rss")).toBe(true);
    expect(graph.nodes.some((n) => n.type === "data.reddit")).toBe(true);
    expect(graph.nodes.some((n) => n.type === "data.http")).toBe(true);

    // Verify deduplication node exists
    const dedupeNode = graph.nodes.find((n) => n.type === "transform.dedupe");
    expect(dedupeNode).toBeDefined();

    // Verify editorial synthesis node exists with page context
    const editorialNode = graph.nodes.find((n) => n.id === "ai_editorial_synthesis");
    expect(editorialNode).toBeDefined();
    expect(editorialNode?.config.systemPrompt).toContain("NBA Daily Pulse");
    expect(editorialNode?.config.systemPrompt).toContain("NBA basketball highlights");

    // Verify slots are generated
    const slotNodes = graph.nodes.filter((n) => n.id.startsWith("slot_ai_"));
    expect(slotNodes).toHaveLength(2);

    // Verify approval gate and create draft action exist
    const approvalGate = graph.nodes.find((n) => n.type === "logic.approval");
    expect(approvalGate).toBeDefined();

    const createDraft = graph.nodes.find((n) => n.type === "action.create_draft");
    expect(createDraft).toBeDefined();
  });

  it("handles a page with no sources gracefully with a fallback search step", () => {
    const result = compileThemeRecipe({
      page: mockPage,
      sources: [],
      slots: mockSlots,
    });

    expect(result.isValid).toBe(true);
    const validation = validateGraph(result.graph);
    expect(validation.ok).toBe(true);

    const searchNode = result.graph.nodes.find((n) => n.type === "data.exa_search");
    expect(searchNode).toBeDefined();
  });

  it("handles a page with no slots gracefully", () => {
    const result = compileThemeRecipe({
      page: mockPage,
      sources: mockSources,
      slots: [],
    });

    expect(result.isValid).toBe(true);
    const validation = validateGraph(result.graph);
    expect(validation.ok).toBe(true);

    const draftNode = result.graph.nodes.find((n) => n.type === "action.create_draft");
    expect(draftNode).toBeDefined();
  });
});
