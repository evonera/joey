import { describe, expect, it, vi } from "vitest";

import {
  createEngagementWebMcpTools,
  type EngagementWebMcpState,
} from "@/lib/engagement-webmcp";

function stateFixture(): EngagementWebMcpState {
  return {
    conversations: [{
      id: "conversation-1",
      platform: "instagram",
      kind: "comment",
      participantName: "A follower",
      participantHandle: "follower",
      status: "active",
      unreadCount: 1,
      lastMessagePreview: "Can you share the link?",
      lastActivityAt: "2026-09-01T10:00:00.000Z",
    }],
    selectedConversation: {
      id: "conversation-1",
      platform: "instagram",
      kind: "comment",
      participantName: "A follower",
      participantHandle: "follower",
      status: "active",
      unreadCount: 1,
      lastMessagePreview: "Can you share the link?",
      lastActivityAt: "2026-09-01T10:00:00.000Z",
    },
    activities: [{
      id: "activity-1",
      type: "comment",
      direction: "incoming",
      body: "Can you share the link?",
      actorName: "A follower",
      actorHandle: "follower",
      deliveryStatus: null,
      isDeleted: false,
      occurredAt: "2026-09-01T10:00:00.000Z",
    }],
    selectedItem: {
      id: "item-1",
      platform: "instagram",
      commenterName: "A follower",
      commenterHandle: "follower",
      text: "Can you share the link?",
      type: "comment",
      status: "pending",
      replyDraft: {
        id: "draft-1",
        content: "Absolutely!",
        status: "pending_review",
        feedback: null,
      },
    },
    stagedReplyEdits: {},
  };
}

function harness() {
  let state = stateFixture();
  const selectConversation = vi.fn(async () => undefined);
  const stageReplyEdit = vi.fn((replyDraftId: string, content: string) => {
    state = { ...state, stagedReplyEdits: { ...state.stagedReplyEdits, [replyDraftId]: content } };
  });
  const tools = createEngagementWebMcpTools({
    getState: () => state,
    selectConversation,
    stageReplyEdit,
  });
  return { tools, getState: () => state, selectConversation, stageReplyEdit };
}

async function call(tools: WebMCP.ModelContextTool[], name: string, input: Record<string, unknown>) {
  const selected = tools.find((tool) => tool.name === name);
  if (!selected) throw new Error(`Missing tool ${name}`);
  const output = await selected.execute(input, { signal: new AbortController().signal }) as {
    content: Array<{ text: string }>;
    isError?: boolean;
  };
  return { ...output, data: JSON.parse(output.content[0].text) as Record<string, unknown> };
}

describe("engagement WebMCP tools", () => {
  it("exposes inspection, view selection, and staged editing without side-effect tools", () => {
    const { tools } = harness();
    expect(tools.map((tool) => tool.name)).toEqual([
      "joey_list_engagement_conversations",
      "joey_inspect_selected_engagement",
      "joey_select_engagement_conversation",
      "joey_stage_reply_edit",
    ]);
    expect(tools.some((tool) => /sync|save|approve|reject|skip|send/.test(tool.name))).toBe(false);
    expect(tools[0].annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(tools[1].annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
  });

  it("selects only a loaded conversation and explicitly leaves it unread", async () => {
    const { tools, selectConversation } = harness();
    const selected = await call(tools, "joey_select_engagement_conversation", {
      conversationId: "conversation-1",
    });
    expect(selected.data).toMatchObject({ ok: true, viewOnly: true, markedRead: false });
    expect(selectConversation).toHaveBeenCalledWith("conversation-1");

    const missing = await call(tools, "joey_select_engagement_conversation", {
      conversationId: "not-loaded",
    });
    expect(missing.isError).toBe(true);
    expect(missing.data.error).toContain("not loaded");
  });

  it("stages reply text locally and exposes it as staged during inspection", async () => {
    const { tools, getState, stageReplyEdit } = harness();
    const staged = await call(tools, "joey_stage_reply_edit", {
      replyDraftId: "draft-1",
      content: "  Absolutely — here is the link!  ",
    });
    expect(staged.data).toMatchObject({ ok: true, stagedOnly: true, replyDraftId: "draft-1" });
    expect(stageReplyEdit).toHaveBeenCalledWith("draft-1", "Absolutely — here is the link!");
    expect(getState().stagedReplyEdits["draft-1"]).toBe("Absolutely — here is the link!");

    const inspected = await call(tools, "joey_inspect_selected_engagement", {});
    const item = inspected.data.engagementItem as { replyDraft: Record<string, unknown> };
    expect(item.replyDraft).toMatchObject({
      id: "draft-1",
      content: "Absolutely — here is the link!",
      stagedByWebMcp: true,
    });
  });

  it("rejects edits for a non-selected or non-editable reply", async () => {
    const { tools, getState } = harness();
    const wrongDraft = await call(tools, "joey_stage_reply_edit", {
      replyDraftId: "draft-2",
      content: "Reply",
    });
    expect(wrongDraft.isError).toBe(true);

    getState().selectedItem!.replyDraft!.status = "sent";
    const sent = await call(tools, "joey_stage_reply_edit", {
      replyDraftId: "draft-1",
      content: "Reply",
    });
    expect(sent.isError).toBe(true);
    expect(sent.data.error).toContain("sent");
  });

  it("rejects staging while the selected draft is open for human editing", async () => {
    const state = stateFixture();
    const stageReplyEdit = vi.fn();
    const tools = createEngagementWebMcpTools({
      getState: () => state,
      selectConversation: vi.fn(async () => undefined),
      canStageReplyEdit: () => false,
      stageReplyEdit,
    });

    const response = await call(tools, "joey_stage_reply_edit", {
      replyDraftId: "draft-1",
      content: "Agent replacement",
    });
    expect(response.isError).toBe(true);
    expect(response.data.error).toContain("human editing");
    expect(stageReplyEdit).not.toHaveBeenCalled();
  });
});
