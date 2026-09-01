import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnifiedInbox } from "../unified-inbox";

const mockGetUnifiedInbox = vi.fn();
const mockMarkConversationRead = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/app/actions/engagement", () => ({
  getUnifiedInbox: (...args: unknown[]) => mockGetUnifiedInbox(...args),
  markConversationRead: (...args: unknown[]) => mockMarkConversationRead(...args),
  syncUnifiedInbox: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/components/engagement/reply-card", () => ({ ReplyCard: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseConversation = {
  platform: "instagram",
  kind: "dm",
  participantHandle: null,
  participantAvatar: null,
  status: "active",
  unreadCount: 0,
  lastActivityAt: new Date("2026-09-01T10:00:00Z"),
};

const conversationA = { ...baseConversation, id: "conversation-a", participantName: "Alpha", lastMessagePreview: "Recent Alpha" };
const conversationB = { ...baseConversation, id: "conversation-b", participantName: "Beta", lastMessagePreview: "Recent Beta" };

function activity(id: string, body: string, occurredAt: string) {
  return {
    id,
    type: "message",
    direction: "incoming",
    body,
    actorName: null,
    actorHandle: null,
    actorAvatar: null,
    attachments: null,
    deliveryStatus: null,
    isRead: true,
    isDeleted: false,
    occurredAt: new Date(occurredAt),
  };
}

function result(selectedConversation: typeof conversationA, activities: ReturnType<typeof activity>[], olderActivityCursor: string | null = null) {
  return {
    conversations: [conversationA, conversationB],
    selectedConversation,
    activities,
    olderActivityCursor,
    selectedEngagementItem: null,
    nextCursor: null,
  };
}

describe("UnifiedInbox", () => {
  it("ignores a stale activity page after switching conversations", async () => {
    let resolveOlder!: (value: ReturnType<typeof result>) => void;
    const olderResponse = new Promise<ReturnType<typeof result>>((resolve) => { resolveOlder = resolve; });
    mockGetUnifiedInbox.mockImplementation((input: { selectedConversationId?: string; activityCursor?: string }) => {
      if (input.activityCursor) return olderResponse;
      if (input.selectedConversationId === conversationB.id) {
        return Promise.resolve(result(conversationB, [activity("beta-message", "Beta timeline", "2026-09-01T10:01:00Z")]));
      }
      throw new Error("Unexpected inbox request");
    });

    render(<UnifiedInbox initialResult={result(
      conversationA,
      [activity("alpha-message", "Alpha timeline", "2026-09-01T10:00:00Z")],
      "2026-09-01T09:00:00.000Z|alpha-old",
    )} />);

    await userEvent.click(screen.getByRole("button", { name: "Load older activity" }));
    await userEvent.click(screen.getByRole("button", { name: /Beta Recent Beta/ }));

    await screen.findByRole("heading", { name: "Beta" });
    expect(screen.getByText("Beta timeline")).toBeInTheDocument();

    resolveOlder(result(conversationA, [activity("alpha-old", "Old Alpha timeline", "2026-09-01T09:00:00Z")]));
    await waitFor(() => expect(screen.queryByText("Old Alpha timeline")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByText("Beta timeline")).toBeInTheDocument();
  });
});
