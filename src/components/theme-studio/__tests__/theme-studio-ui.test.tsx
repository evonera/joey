import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText("Sources")).toBeDefined();
    expect(screen.getByText("Daily Mix")).toBeDefined();
    expect(screen.getByText("Templates")).toBeDefined();
    expect(screen.getByText("Preview Day")).toBeDefined();
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
        format: {
          id: "fmt_1",
          slug: "instagram-card-1080",
          platform: "instagram",
          name: "Square Card",
          mediaType: "image",
          aspectRatio: "1:1",
        },
      },
    ];

    const mockSources = [
      {
        id: "src_1",
        name: "Open Source AI Feed",
        sourceType: "rss",
        rightsCategory: "cc_by",
      },
    ];

    render(
      <PreviewDaySimulator
        themePage={mockThemePage}
        slots={mockSlots}
        sources={mockSources}
      />
    );

    expect(screen.getByText(/"Preview Day" Simulation/)).toBeDefined();
    expect(screen.getByText(/Simulate a Full Day's Production/)).toBeDefined();
  });
});

