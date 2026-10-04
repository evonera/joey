import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ review: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/theme-packages", () => ({ reviewThemePackage: mocks.review, publishThemePackage: vi.fn() }));
vi.mock("../RenderControls", () => ({ RenderControls: () => null }));
import { ThemePackageQueue } from "../ThemePackageQueue";
const pkg = {
  id: "pkg", title: "A careful draft", caption: "Caption", status: "pending_review",
  renderedAssetUrls: [{ url: "https://assets.example.com/card.png" }],
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:01:00Z",
  provenance: { requiresFactReview: true, researchFacts: [{ claim: "One source supports the launch.", corroborationStatus: "unverified", evidence: [{ sourceUrl: "https://news.example.com/story", quote: "A launch happened on Monday." }] }] },
};
describe("Theme Package fact-review UI", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.review.mockResolvedValue({ package: {} }); });
  it("shows the evidence and keeps approval disabled until review is acknowledged", async () => {
    render(<ThemePackageQueue packages={[pkg]} />);
    expect(screen.getByText(/Fact review required/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Approve" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith("pkg", "approve", undefined, { updatedAt: new Date(pkg.updatedAt).toISOString() }));
  });
  it("invalidates acknowledgement when a package revision changes", () => {
    const view = render(<ThemePackageQueue packages={[pkg]} />);
    fireEvent.click(screen.getByRole("checkbox"));
    view.rerender(<ThemePackageQueue packages={[{ ...pkg, updatedAt: "2026-10-01T00:02:00Z" }]} />);
    expect(screen.getByRole("button", { name: "Approve" }).hasAttribute("disabled")).toBe(true);
  });
});
