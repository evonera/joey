import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ setup: vi.fn(), runs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/app/actions/scouts", () => ({ getScoutSetup: mocks.setup, getScoutRuns: mocks.runs, createScout: vi.fn(), updateScout: vi.fn(), runScoutNow: vi.fn(), toggleScout: vi.fn(), deleteScout: vi.fn() }));
import { ScoutsClient } from "@/app/(dashboard)/scouts/scouts-client";
const source = { id: "youtube-source", name: "Uploads", platform: "youtube", targetUrl: "https://youtube.com/@GoogleDevelopers", goalCondition: "views > 100", isActive: true, pollIntervalMinutes: 1440, lastPolledAt: null, latestAlert: null, createdAt: new Date(), updatedAt: new Date() };
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("YouTube source readiness", () => {
  it("does not let a global social provider mask degraded YouTube or block RSS", async () => {
    mocks.runs.mockResolvedValue([]);
    mocks.setup.mockImplementation(async (id?: string) => id === source.id ? { ready: false, provider: "youtube", degraded: true, issue: "Add a YouTube Data API key." } : { ready: true, provider: "apify" });
    const rss = { ...source, id: "rss-source", name: "News feed", platform: "rss", targetUrl: "https://example.com/feed" };
    render(<ScoutsClient initialScouts={[source, rss]} dailyMonitoringAllowed />);
    expect(await screen.findByText("YouTube monitoring degraded")).toBeInTheDocument();
    expect(screen.getAllByText("Add a YouTube Data API key.").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Configure YouTube Data API" })).toHaveAttribute("href", "/settings?tab=apps");
    expect(screen.getByRole("button", { name: /run scout scan right now/i })).toBeDisabled();
    expect(screen.getByText(/1 active · 1 waiting for plan or source/)).toBeInTheDocument();
    expect(screen.getByText("News feed")).toBeInTheDocument();
  });
  it("labels configured official API collection and enables checks", async () => {
    mocks.runs.mockResolvedValue([]);
    mocks.setup.mockResolvedValue({ ready: true, provider: "youtube", degraded: false });
    render(<ScoutsClient initialScouts={[source]} dailyMonitoringAllowed />);
    await waitFor(() => expect(screen.getByRole("button", { name: /run scout scan right now/i })).toBeEnabled());
    expect(screen.getByText("YouTube Data API")).toBeInTheDocument();
    expect(screen.queryByText("YouTube monitoring degraded")).not.toBeInTheDocument();
  });
});
