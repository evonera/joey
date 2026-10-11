import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const webMcpHarness = vi.hoisted(() => ({ tools: [] as WebMCP.ModelContextTool[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/theme-studio/page_abc",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/actions/theme-pages", () => ({
  activateThemePage: vi.fn(),
  pauseThemePage: vi.fn(),
}));
vi.mock("@/app/actions/theme-slots", () => ({
  createThemeSlot: vi.fn(), deleteThemeSlot: vi.fn(), reorderThemeSlots: vi.fn(),
}));
vi.mock("@/app/actions/theme-sources", () => ({
  createThemeSource: vi.fn(), deleteThemeSource: vi.fn(), toggleThemeSource: vi.fn(),
}));
vi.mock("@/app/actions/dm-rules", () => ({
  createDmRule: vi.fn(), deleteDmRule: vi.fn(), toggleDmRule: vi.fn(),
}));
vi.mock("@/app/actions/mix-recommendations", () => ({
  getMixRecommendations: vi.fn().mockResolvedValue({ recommendation: null }),
  acceptRecommendation: vi.fn(),
  discardRecommendation: vi.fn(),
}));
vi.mock("@/hooks/use-webmcp-tools", () => ({
  useWebMcpTools: (tools: WebMCP.ModelContextTool[]) => {
    webMcpHarness.tools = tools;
    return true;
  },
}));
import { activateThemePage } from "@/app/actions/theme-pages";
import { ThemePageHeader } from "@/components/theme-studio/ThemePageHeader";
import { DailyMixScheduler } from "@/components/theme-studio/DailyMixScheduler";
import { SourcesManager } from "@/components/theme-studio/SourcesManager";
import { DmRulesBuilder } from "@/components/theme-studio/DmRulesBuilder";
import { PreviewDaySimulator } from "@/components/theme-studio/PreviewDaySimulator";

describe("Theme Studio UI Components", () => {
  it("renders ThemePageHeader with page name and navigation tabs", () => {
    const mockPage = {
      id: "page_abc",
      name: "Tech AI Weekly",
      niche: "AI engineering updates",
      status: "active",
      recipeRevision: 2,
    };

    render(<ThemePageHeader page={mockPage} />);

    expect(screen.getByText("Tech AI Weekly")).toBeDefined();
    expect(screen.getByText(/AI engineering updates/)).toBeDefined();
    for (const section of ["Overview", "Sources", "Daily Mix", "Templates", "Preview Day"]) {
      expect(screen.getByRole("link", { name: section })).toBeDefined();
      expect(screen.getByRole("option", { name: section })).toBeDefined();
    }
    expect(webMcpHarness.tools.map((tool) => tool.name)).toEqual([
      "theme_studio_inspect_page",
      "theme_studio_check_readiness",
    ]);
  });

  it("enables draft-only generation before connecting a publishing account", async () => {
    vi.mocked(activateThemePage).mockResolvedValueOnce({ page: { id: "page_abc" } } as Awaited<ReturnType<typeof activateThemePage>>);
    render(<ThemePageHeader page={{ id: "page_abc", name: "Draft pilot", status: "draft", recipeRevision: 0 }} webMcpState={{
      page: { id: "page_abc", name: "Draft pilot", niche: null, audience: null, status: "draft", rightsPolicy: "strict", connectedAccountCount: 0, connectedPlatforms: [] },
      sources: [{ id: "source", name: "Own feed", sourceType: "rss", rightsCategory: "owned", isActive: true }],
      slots: [{ id: "slot", label: "Card", cadence: "daily", isActive: true, platform: "instagram" }], packages: [],
    }} />);
    expect(screen.queryByText("Select an active instagram publishing account")).toBeNull();
    fireEvent.change(screen.getByLabelText("Generation mode"), { target: { value: "publishing" } });
    expect(screen.getByText("Select an active instagram publishing account.")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Generation mode"), { target: { value: "draft_only" } });
    fireEvent.click(screen.getByRole("button", { name: "Enable Draft Generation" }));
    await waitFor(() => expect(activateThemePage).toHaveBeenCalledWith("page_abc", "draft_only"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause Automation" })).toBeDefined());
  });

  it("renders DailyMixScheduler with initial slots", () => {
    const mockSlots = [
      {
        id: "slot_1",
        themePageId: "page_abc",
        formatId: "fmt_card",
        label: "Morning AI News",
        cadence: "daily",
        priority: 0,
        isActive: true,
        format: {
          id: "fmt_card",
          slug: "instagram-card-1080",
          name: "Instagram Square Card",
          platform: "instagram",
          mediaType: "image",
          aspectRatio: "1:1",
        },
      },
    ];

    const mockFormats = [
      {
        id: "fmt_card",
        slug: "instagram-card-1080",
        name: "Instagram Square Card",
        platform: "instagram",
        mediaType: "image",
        aspectRatio: "1:1",
      },
    ];

    render(
      <DailyMixScheduler
        themePageId="page_abc"
        initialSlots={mockSlots}
        availableFormats={mockFormats}
        availableTemplates={[]}
      />
    );

    expect(screen.getByText("Daily Content Mix")).toBeDefined();
    expect(screen.getByText("Morning AI News")).toBeDefined();
    expect(screen.getByText(/Instagram Square Card/)).toBeDefined();
  });

  it("renders SourcesManager with connected feeds", () => {
    const mockSources = [
      {
        id: "src_1",
        themePageId: "page_abc",
        name: "Hacker News AI Feed",
        sourceType: "rss",
        url: "https://news.ycombinator.com/rss",
        pollIntervalMinutes: 60,
        freshnessWindowHours: 24,
        rightsCategory: "cc_by",
        isActive: true,
      },
    ];

    render(<SourcesManager themePageId="page_abc" initialSources={mockSources} />);

    expect(screen.getByText("Trusted Sources & Feeds")).toBeDefined();
    expect(screen.getByText("Hacker News AI Feed")).toBeDefined();
    expect(screen.getByText(/24h window/)).toBeDefined();
  });

  it("renders DmRulesBuilder with keyword triggers", () => {
    const mockRules = [
      {
        id: "rule_1",
        themePageId: "page_abc",
        triggerType: "keyword",
        triggerValue: "PROMPT",
        responseTemplate: "Here is your free prompt pack: {{link}}",
        responseLink: "https://example.com/pack",
        isActive: true,
        stats: { triggered: 12, dmsSent: 12, clicks: 8 },
      },
    ];

    render(<DmRulesBuilder themePageId="page_abc" initialRules={mockRules} />);

    expect(screen.getByText("Keyword DM Funnels")).toBeDefined();
    expect(screen.getByText('"PROMPT"')).toBeDefined();
    expect(screen.getByText(/12 DMs Sent/)).toBeDefined();
    expect(screen.getByText(/8 Clicks/)).toBeDefined();
  });

  it("renders PreviewDaySimulator with accurate source provenance badges", () => {
    const mockThemePage = {
      id: "page_abc",
      name: "Tech AI Weekly",
      niche: "AI engineering updates",
    };

    const mockSlots = [
      {
        id: "slot_1",
        label: "Morning Card",
        format: { id: "fmt_1", slug: "square-card", platform: "instagram", name: "Square Card", mediaType: "image", aspectRatio: "1:1" },
      },
    ];

    const mockSources = [
      { id: "src_1", name: "Open Source AI Feed", sourceType: "rss", rightsCategory: "cc_by" },
    ];

    render(
      <PreviewDaySimulator
        themePage={mockThemePage}
        slots={mockSlots}
        sources={mockSources}
      />
    );

    expect(screen.getByText(/Sample Day Preview/)).toBeDefined();
    expect(screen.getByText(/Preview Your Content Layouts/)).toBeDefined();
  });
});
