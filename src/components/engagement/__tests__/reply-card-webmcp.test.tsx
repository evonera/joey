import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReplyCard } from "@/components/engagement/reply-card";

const updateReplyDraft = vi.fn(async (_replyDraftId: string, _content: string) => ({ success: true }));

afterEach(() => {
  updateReplyDraft.mockReset();
  updateReplyDraft.mockResolvedValue({ success: true });
});

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
      onEditSaved={onSaved}
      onActionComplete={onComplete}
    />);

    expect(updateReplyDraft).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateReplyDraft).toHaveBeenCalledWith("draft-1", "Reviewed reply");
    expect(onSaved).toHaveBeenCalledWith("Reviewed reply", "Reviewed reply");
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("keeps the editor open when a newer staged edit supersedes the saved snapshot", async () => {
    const onSaved = vi.fn(() => false);
    render(<ReplyCard
      item={item}
      stagedContent="Older staged reply"
      onEditSaved={onSaved}
      onActionComplete={vi.fn()}
    />);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaved).toHaveBeenCalledWith("Older staged reply", "Older staged reply");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("clears the original staged snapshot after saving a human edit", async () => {
    const onSaved = vi.fn(() => true);
    render(<ReplyCard
      item={item}
      stagedContent="Agent-staged reply"
      onEditSaved={onSaved}
      onActionComplete={vi.fn()}
    />);

    const editor = screen.getByRole("textbox");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Human-reviewed reply");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateReplyDraft).toHaveBeenLastCalledWith("draft-1", "Human-reviewed reply");
    expect(onSaved).toHaveBeenCalledWith("Human-reviewed reply", "Agent-staged reply");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Human-reviewed reply")).toBeInTheDocument();
    expect(screen.queryByText("Original reply")).not.toBeInTheDocument();
  });

  it("freezes the staged editor while its save is pending", async () => {
    let resolveSave!: (value: { success: true }) => void;
    updateReplyDraft.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    const onSaved = vi.fn(() => true);
    render(<ReplyCard
      item={item}
      stagedContent="Reviewed reply"
      onEditSaved={onSaved}
      onActionComplete={vi.fn()}
    />);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();

    resolveSave({ success: true });
    await screen.findByRole("button", { name: "Approve & Send" });
    expect(onSaved).toHaveBeenCalledWith("Reviewed reply", "Reviewed reply");
  });

  it("does not replace active human input with a newer staged prop", async () => {
    const { rerender } = render(<ReplyCard
      item={item}
      stagedContent="First agent proposal"
      onActionComplete={vi.fn()}
    />);
    const editor = screen.getByRole("textbox");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Human work in progress");

    rerender(<ReplyCard
      item={item}
      stagedContent="Second agent proposal"
      onActionComplete={vi.fn()}
    />);
    expect(screen.getByRole("textbox")).toHaveValue("Human work in progress");
  });

  it("accepts later authoritative server content after optimistic reconciliation", async () => {
    const onSaved = vi.fn(() => true);
    const { rerender } = render(<ReplyCard
      item={item}
      stagedContent="Agent proposal"
      onEditSaved={onSaved}
      onActionComplete={vi.fn()}
    />);
    const editor = screen.getByRole("textbox");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Human-approved revision");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const reconciledItem = { ...item, replyDraft: { ...item.replyDraft, content: "Human-approved revision" } };
    rerender(<ReplyCard item={reconciledItem} onEditSaved={onSaved} onActionComplete={vi.fn()} />);
    expect(screen.getByText("Human-approved revision")).toBeInTheDocument();

    const serverUpdatedItem = { ...item, replyDraft: { ...item.replyDraft, content: "Later server revision" } };
    rerender(<ReplyCard item={serverUpdatedItem} onEditSaved={onSaved} onActionComplete={vi.fn()} />);
    expect(screen.getByText("Later server revision")).toBeInTheDocument();
  });

  it("resets unsaved human state when the selected reply draft changes", async () => {
    const { rerender } = render(<ReplyCard item={item} onActionComplete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("textbox");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Unsaved text from conversation A");

    const conversationBItem = {
      ...item,
      id: "item-2",
      replyDraft: { ...item.replyDraft, id: "draft-2", content: "Conversation B reply" },
    };
    rerender(<ReplyCard item={conversationBItem} onActionComplete={vi.fn()} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Conversation B reply")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved text from conversation A")).not.toBeInTheDocument();
  });
});
