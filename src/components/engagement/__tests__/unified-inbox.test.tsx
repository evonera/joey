import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnifiedInbox } from "../unified-inbox";

const mockGetUnifiedInbox = vi.fn();
const mockMarkConversationRead = vi.fn().mockResolvedValue({ success: true });
const webMcpHarness = vi.hoisted(() => ({ tools: [] as WebMCP.ModelContextTool[] }));

vi.mock("@/app/actions/engagement", () => ({
  getUnifiedInbox: (...args: unknown[]) => mockGetUnifiedInbox(...args),
  markConversationRead: (...args: unknown[]) => mockMarkConversationRead(...args),
  syncUnifiedInbox: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/components/engagement/reply-card", () => ({ ReplyCard: () => null }));
vi.mock("@/hooks/use-webmcp-tools", () => ({
  useWebMcpTools: (tools: WebMCP.ModelContextTool[]) => {
    webMcpHarness.tools = tools;
    return true;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  webMcpHarness.tools = [];
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
  it("makes a successful agent selection immediately observable to inspection", async () => {
    mockGetUnifiedInbox.mockResolvedValue(result(
      conversationB,
      [activity("beta-message", "Beta timeline", "2026-09-01T10:01:00Z")],
    ));
    render(<UnifiedInbox initialResult={result(
      conversationA,
      [activity("alpha-message", "Alpha timeline", "2026-09-01T10:00:00Z")],
    )} />);

    const selectTool = webMcpHarness.tools.find((tool) => tool.name === "joey_select_engagement_conversation")!;
    const inspectTool = webMcpHarness.tools.find((tool) => tool.name === "joey_inspect_selected_engagement")!;
    const options = { signal: new AbortController().signal };
    const selected = await selectTool.execute({ conversationId: conversationB.id }, options) as { isError?: boolean };
    const inspected = await inspectTool.execute({}, options) as { content: Array<{ text: string }> };

    expect(selected.isError).not.toBe(true);
    expect(JSON.parse(inspected.content[0].text).selectedConversation.id).toBe(conversationB.id);
  });

  it("reports an agent selection failure when the requested conversation was not loaded", async () => {
    mockGetUnifiedInbox.mockResolvedValue(result(
      conversationA,
      [activity("alpha-message", "Alpha timeline", "2026-09-01T10:00:00Z")],
    ));
    render(<UnifiedInbox initialResult={result(
      conversationA,
      [activity("alpha-message", "Alpha timeline", "2026-09-01T10:00:00Z")],
    )} />);

    const selectTool = webMcpHarness.tools.find((tool) => tool.name === "joey_select_engagement_conversation");
    expect(selectTool).toBeDefined();
    const response = await selectTool!.execute(
      { conversationId: conversationB.id },
      { signal: new AbortController().signal },
    ) as { content: Array<{ text: string }>; isError?: boolean };

    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0].text).error).toContain("could not be established");
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
  });

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
