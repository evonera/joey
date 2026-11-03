import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), publish: vi.fn() }));
vi.mock("@/app/actions/theme-publication-preview", () => ({ prepareThemePublication: mocks.prepare, publishConfirmedThemePackage: mocks.publish }));
import { ThemePublishButton } from "./ThemePublishButton";

describe("theme publication confirmation", () => {
  it("shows the actual destinations and adapted payload before sending the snapshot", async () => {
    mocks.prepare.mockResolvedValueOnce({ preview: { fingerprint: "a".repeat(64), publishEarly: false, accounts: [{ id: "a", accountName: "My account", platform: "x", platformAccountId: "remote" }], payload: { title: "Headline", content: "Post body", hashtags: ["#tag"], mediaItems: [{ type: "image", url: "https://example.com/image.png" }], platforms: [{ accountId: "remote", customContent: "Adapted text" }], scheduledFor: "2030-01-01T00:00:00Z" } } });
    mocks.publish.mockResolvedValueOnce({ success: true, status: "published" });
    render(<ThemePublishButton packageId="pkg" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish with Zernio" }));
    expect(await screen.findByText("Headline")).toBeInTheDocument();
    expect(screen.getByText("Adapted text")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "image 1" })).toHaveAttribute("href", "https://example.com/image.png");
    expect(screen.getByText(/Scheduled for/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mocks.publish).toHaveBeenCalledWith("pkg", false, "a".repeat(64));
  });
});
