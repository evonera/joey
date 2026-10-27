import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { DraftCard } from "../draft-card";
import { approveDraft } from "@/app/actions/drafts";
import { prepareDraftPublication } from "@/app/actions/publisher";

vi.mock("@/app/actions/drafts", () => ({ updateDraft: vi.fn(), approveDraft: vi.fn(), rejectDraft: vi.fn(), deleteDraft: vi.fn() }));
vi.mock("@/app/actions/publisher", () => ({ publishDraft: vi.fn(), prepareDraftPublication: vi.fn(), publishConfirmedDraft: vi.fn() }));
vi.mock("@/components/drafts/draft-review-room", () => ({
  DraftReviewRoom: ({ children }: { children: ReactNode }) => children,
  useDraftCollaboration: () => ({ broadcastApproval: vi.fn(), broadcastRejection: vi.fn(), broadcastUpdate: vi.fn() }),
}));
vi.mock("@/components/collaboration/liveblocks-provider", () => ({ useLiveblocksConfig: () => ({ isConfigured: false }) }));
vi.mock("@liveblocks/react", () => ({ useThreads: () => ({ threads: [] }), useIsInsideRoom: () => false }));
vi.mock("@/components/drafts/draft-comments", () => ({ DraftComments: () => null }));
vi.mock("@/components/calendar/editorial-suggestions", () => ({ EditorialSuggestions: () => null }));
vi.mock("@/components/compose/publish-confirm-dialog", () => ({
  PublishConfirmDialog: ({ open, content }: { open: boolean; content: string }) => open ? <div role="dialog">{content || "No text content"}</div> : null,
}));

describe("draft publication confirmation", () => {
  it("shows the current saved caption after a refresh, even when old variants and edit state remain", async () => {
    const draft = {
      id: "pilot-draft", status: "approved", content: "Original approved caption",
      variants: [{ name: "default", content: "Original AI variant" }],
      platformOptions: { accountId: "account", platform: "instagram" },
    };
    const props = { draft, onActionComplete: vi.fn() };
    vi.mocked(prepareDraftPublication).mockResolvedValueOnce({ confirmation: { content: "Saved edited caption", platformOptions: { accountId: "account" }, status: "approved", scheduledFor: null, account: { id: "account", accountName: "Account", platform: "instagram", platformAccountId: "remote" } } });
    const { rerender } = render(<DraftCard {...props} />);
    rerender(<DraftCard {...props} draft={{ ...draft, content: "Saved edited caption" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish Now" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Saved edited caption");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Original AI variant");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Original approved caption");
  });

  it("does not substitute a discarded variant for a media-only post", async () => {
    vi.mocked(prepareDraftPublication).mockResolvedValueOnce({ confirmation: { content: null, platformOptions: { accountId: "account", mediaUrls: ["https://example.com/image.png"] }, status: "approved", scheduledFor: null, account: { id: "account", accountName: "Account", platform: "instagram", platformAccountId: "remote" } } });
    render(<DraftCard draft={{ id: "media-only", status: "approved", content: null,
      variants: [{ name: "discarded", content: "Do not publish this copy" }],
      platformOptions: { accountId: "account", mediaUrls: ["https://example.com/image.png"] },
    }} onActionComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish Now" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("No text content");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Do not publish this copy");
  });

  it("allows approval without choosing an old variant for a media-only draft", async () => {
    vi.mocked(approveDraft).mockResolvedValueOnce({ success: true });
    render(<DraftCard draft={{ id: "media-only-review", status: "pending_review", content: "",
      variants: [{ name: "old", content: "Discarded" }],
      platformOptions: { accountId: "account", mediaUrls: ["https://example.com/image.png"] },
    }} onActionComplete={vi.fn()} />);
    expect(screen.getByText("Media post (no caption)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve without caption" }));
    expect(approveDraft).toHaveBeenCalledWith("media-only-review", undefined, undefined);
  });
});
