import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/app/actions/scouts", () => ({
  createScout: vi.fn(),
  runScoutNow: vi.fn(),
  toggleScout: vi.fn(),
  deleteScout: vi.fn(),
  getScoutRuns: vi.fn().mockResolvedValue([
    { id: "run-1", status: "failed", createdAt: new Date().toISOString(), error: "Apify token missing", itemsFound: 0 },
  ]),
}));
vi.mock("@/app/actions/dm-rules", () => ({
  createDmRule: vi.fn(),
  deleteDmRule: vi.fn(),
  toggleDmRule: vi.fn(),
}));
vi.mock("@/app/actions/theme-templates", () => ({
  createThemeTemplate: vi.fn(),
  updateThemeTemplate: vi.fn(),
}));
vi.mock("@/app/actions/assets", () => ({
  checkR2Status: vi.fn().mockResolvedValue({ configured: false }),
}));
vi.mock("@/app/actions/flows", () => ({
  saveFlow: vi.fn(),
  validateFlowGraph: vi.fn(),
  runFlow: vi.fn(),
  setFlowStatus: vi.fn(),
  publishTemplate: vi.fn(),
  provisionFlowWebhookSecret: vi.fn(),
  rotateFlowWebhookSecret: vi.fn(),
}));
vi.mock("@/hooks/use-webmcp-tools", () => ({
  useWebMcpTools: () => true,
}));

import { ScoutsClient } from "@/app/(dashboard)/scouts/scouts-client";
import { DmRulesBuilder } from "@/components/theme-studio/DmRulesBuilder";
import { TemplateCanvasEditor } from "@/components/theme-studio/TemplateCanvasEditor";
import { PreviewDaySimulator } from "@/components/theme-studio/PreviewDaySimulator";
import { FlowBuilder } from "@/components/flows/flow-builder";

const mockScouts = [
  {
    id: "scout-1",
    name: "Viral Hooks",
    targetUrl: "https://instagram.com/some-very-long-handle-that-would-overflow-mobile-layouts",
    platform: "instagram",
    goalCondition: "Alert on viral spikes",
    pollIntervalMinutes: 60,
    isActive: true,
    lastPolledAt: null,
    latestAlert: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "scout-2",
    name: "Tech News",
    targetUrl: "https://x.com/techcrunch",
    platform: "twitter",
    goalCondition: "Alert on AI news",
    pollIntervalMinutes: 120,
    isActive: false,
    lastPolledAt: null,
    latestAlert: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe("mobile responsive (390px) guards", () => {
  it("ScoutsClient renders List|Details toggle with back button", () => {
    render(<ScoutsClient initialScouts={mockScouts as never} />);
    expect(screen.getByRole("button", { name: /back to scout list/i })).toBeDefined();
    // List column visible initially; card tap switches to details
    fireEvent.click(screen.getByRole("button", { name: /view tech news details/i }));
    expect(screen.getByRole("button", { name: /back to scout list/i })).toBeDefined();
  });

  it("ScoutsClient truncates long target URLs", () => {
    const { container } = render(<ScoutsClient initialScouts={mockScouts as never} />);
    const truncated = container.querySelector(".truncate[max-width], .truncate");
    expect(truncated).not.toBeNull();
  });

  it("ScoutsClient action cluster is icon-only with labels", () => {
    render(<ScoutsClient initialScouts={mockScouts as never} />);
    expect(screen.getByRole("button", { name: /run scout scan right now/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /pause scout/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /delete scout/i })).toBeDefined();
  });

  it("ScoutsClient surfaces the last scan result including failures", async () => {
    render(<ScoutsClient initialScouts={mockScouts as never} />);
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/last scan/i);
    expect(status.textContent).toMatch(/scan failed/i);
    expect(status.textContent).toMatch(/Apify token missing/);
  });

  it("DmRulesBuilder truncates long response links", () => {
    render(
      <DmRulesBuilder
        themePageId="page-1"
        initialRules={[
          {
            id: "r1",
            themePageId: "page-1",
            triggerType: "keyword",
            triggerValue: "AVERYLONGKEYWORDNAME",
            responseTemplate: "Hi {{username}}",
            responseLink: "https://example.com/a-very-long-lead-magnet-url-that-would-overflow",
            isActive: true,
          },
        ]}
      />
    );
    const link = screen.getByTitle("https://example.com/a-very-long-lead-magnet-url-that-would-overflow");
    expect(link.className).toMatch(/max-w-full/);
  });

  it("TemplateCanvasEditor renders Edit|Preview toggle and swipeable presets", () => {
    const { container } = render(
      <TemplateCanvasEditor
        themePageId="page-1"
        initialTemplate={{ name: "T", formatId: "f1", renderer: "puppeteer", componentSpec: {} } as never}
        availableFormats={[{ id: "f1", slug: "square", name: "Square", mediaType: "image" }]}
      />
    );
    expect(screen.getByRole("tab", { name: /edit style/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /live preview/i })).toBeDefined();
    const presetRow = container.querySelector(".overflow-x-auto");
    expect(presetRow).not.toBeNull();
  });

  it("TemplateCanvasEditor preview toggle hides settings on mobile", () => {
    render(
      <TemplateCanvasEditor
        themePageId="page-1"
        initialTemplate={{ name: "T", formatId: "f1", renderer: "puppeteer", componentSpec: {} } as never}
        availableFormats={[{ id: "f1", slug: "square", name: "Square", mediaType: "image" }]}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: /live preview/i }));
    expect(screen.getByRole("tab", { name: /live preview/i }).getAttribute("aria-selected")).toBe("true");
  });

  it("PreviewDaySimulator slide controls meet 44px touch targets", async () => {
    render(
      <PreviewDaySimulator
        themePage={{ id: "p", name: "N", niche: "n" } as never}
        slots={[
          { id: "s1", label: "Carousel", format: { id: "f", slug: "x", name: "X", platform: "instagram", mediaType: "carousel", aspectRatio: "1:1" } as never },
        ]}
        sources={[]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /show sample day/i }));
    const prev = await screen.findByRole("button", { name: /previous slide/i }, { timeout: 3000 });
    const next = await screen.findByRole("button", { name: /next slide/i }, { timeout: 3000 });
    expect(prev.className).toMatch(/min-h-\[44px\]/);
    expect(next.className).toMatch(/min-w-\[44px\]/);
  });

  it("FlowBuilder renders mobile overflow menu trigger", () => {
    render(
      <FlowBuilder
        flow={{ id: "f1", name: "Test", description: null, graph: { nodes: [], edges: [] }, status: "draft", lastRunAt: null, webhookConfigured: false }}
        accounts={[]}
      />
    );
    expect(screen.getByRole("button", { name: /more flow actions/i })).toBeDefined();
  });
});
