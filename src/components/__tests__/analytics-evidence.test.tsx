import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostPerformanceTable } from "../post-performance-table";
import { SectionCards } from "../section-cards";
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(cleanup);
describe("analytics unknown evidence", () => {
  it("shows unknown metrics and publication date instead of zero or today", () => {
    render(<PostPerformanceTable posts={[{ id: "post", content: "Undated post", platforms: [{ platform: "instagram", analytics: null }] }]} />);
    expect(screen.getByText("Undated post")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(5);
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });
  it("uses the same denominator for post and summary and explains it", () => {
    render(<PostPerformanceTable posts={[{ id: "post", content: "Measured post", platforms: [{ platform: "youtube", analytics: { impressions: 100, views: 200, likes: 10, comments: 0, shares: 0 } }] }]} />);
    expect(screen.getByText("10.0%")).toBeInTheDocument();
    cleanup();
    render(<SectionCards summary={{ totalPosts: 1, impressions: 100, views: 200, likes: 10, comments: 0, shares: 0, engagementRate: 10, pagesFetched: 1, truncated: false }} />);
    expect(screen.getByText("10.00%")).toBeInTheDocument();
    expect(screen.getByText(/impressions \(views when unavailable\)/)).toBeInTheDocument();
  });
  it("keeps unknown card totals and rate unavailable", () => {
    render(<SectionCards summary={{ totalPosts: 1, impressions: null, views: null, likes: 2, comments: null, shares: null, engagementRate: null, pagesFetched: 1, truncated: false }} />);
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
