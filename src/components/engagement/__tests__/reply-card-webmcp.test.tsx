import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReplyCard } from "@/components/engagement/reply-card";

const updateReplyDraft = vi.fn(async (_replyDraftId: string, _content: string) => ({ success: true }));

vi.mock("@/app/actions/engagement", () => ({
  approveReply: vi.fn(),
  rejectReply: vi.fn(),
  sendReply: vi.fn(),
  skipEngagementItem: vi.fn(),
  updateReplyDraft: (replyDraftId: string, content: string) => updateReplyDraft(replyDraftId, content),
}));

const item = {
  id: "item-1",
  platform: "instagram",
  commenterName: "A follower",
  commenterHandle: "follower",
  commenterAvatar: null,
  text: "Can you share the link?",
  type: "comment",
  status: "pending",
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  replyDraft: {
    id: "draft-1",
    content: "Original reply",
    status: "pending_review",
    feedback: null,
  },
};

describe("ReplyCard WebMCP staging", () => {
  it("opens staged content in the editor without exposing approve or send", async () => {
    const onDiscard = vi.fn();
    render(<ReplyCard
      item={item}
      stagedContent="Agent-staged reply"
      onDiscardStagedEdit={onDiscard}
      onActionComplete={vi.fn()}
    />);

    expect(screen.getByRole("status")).toHaveTextContent("WebMCP staged this edit");
    expect(screen.getByRole("textbox")).toHaveValue("Agent-staged reply");
    expect(screen.queryByRole("button", { name: /Approve|Send/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("persists staged text only after the human clicks Save", async () => {
    const onSaved = vi.fn(() => true);
    const onComplete = vi.fn();
    render(<ReplyCard
      item={item}
      stagedContent="Reviewed reply"
      onStagedEditSaved={onSaved}
      onActionComplete={onComplete}
    />);

    expect(updateReplyDraft).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateReplyDraft).toHaveBeenCalledWith("draft-1", "Reviewed reply");
    expect(onSaved).toHaveBeenCalledWith("Reviewed reply");
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("keeps the editor open when a newer staged edit supersedes the saved snapshot", async () => {
    const onSaved = vi.fn(() => false);
    render(<ReplyCard
      item={item}
      stagedContent="Older staged reply"
      onStagedEditSaved={onSaved}
      onActionComplete={vi.fn()}
    />);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaved).toHaveBeenCalledWith("Older staged reply");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
