import { z } from "zod";

import { defineWebMcpTool } from "@/lib/webmcp";

const emptyInput = z.object({}).strict();
const selectConversationInput = z.object({
  conversationId: z.string().trim().min(1).max(128),
}).strict();
const stageReplyInput = z.object({
  replyDraftId: z.string().trim().min(1).max(128),
  content: z.string().trim().min(1).max(4_096),
}).strict();

type DateValue = Date | string;

export type EngagementWebMcpConversation = {
  id: string;
  platform: string;
  kind: string;
  participantName: string | null;
  participantHandle: string | null;
  status: string;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastActivityAt: DateValue;
};

export type EngagementWebMcpActivity = {
  id: string;
  type: string;
  direction: string;
  body: string | null;
  actorName: string | null;
  actorHandle: string | null;
  deliveryStatus: string | null;
  isDeleted: boolean;
  occurredAt: DateValue;
};

export type EngagementWebMcpItem = {
  id: string;
  platform: string;
  commenterName: string | null;
  commenterHandle: string | null;
  text: string;
  type: string;
  status: string;
  replyDraft: {
    id: string;
    content: string;
    status: string;
    feedback: string | null;
  } | null;
} | null;

export type EngagementWebMcpState = {
  conversations: EngagementWebMcpConversation[];
  selectedConversation: EngagementWebMcpConversation | null;
  activities: EngagementWebMcpActivity[];
  selectedItem: EngagementWebMcpItem;
  stagedReplyEdits: Record<string, string>;
};

export type EngagementWebMcpController = {
  getState: () => EngagementWebMcpState;
  selectConversation: (conversationId: string) => Promise<void>;
  stageReplyEdit: (replyDraftId: string, content: string) => void;
};

function text(value: string | null, max = 1_000): string | null {
  if (value === null) return null;
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

function iso(value: DateValue): string {
  return new Date(value).toISOString();
}

function compactConversation(conversation: EngagementWebMcpConversation) {
  return {
    id: conversation.id,
    platform: conversation.platform,
    kind: conversation.kind,
    participantName: text(conversation.participantName, 200),
    participantHandle: text(conversation.participantHandle, 200),
    status: conversation.status,
    unreadCount: conversation.unreadCount,
    lastMessagePreview: text(conversation.lastMessagePreview),
    lastActivityAt: iso(conversation.lastActivityAt),
  };
}

function inspectSelected(state: EngagementWebMcpState) {
  const item = state.selectedItem;
  const draft = item?.replyDraft;
  return {
    viewOnly: true,
    selectedConversation: state.selectedConversation ? compactConversation(state.selectedConversation) : null,
    activities: state.activities.slice(-100).map((activity) => ({
      id: activity.id,
      type: activity.type,
      direction: activity.direction,
      body: text(activity.body, 2_000),
      actorName: text(activity.actorName, 200),
      actorHandle: text(activity.actorHandle, 200),
      deliveryStatus: activity.deliveryStatus,
      isDeleted: activity.isDeleted,
      occurredAt: iso(activity.occurredAt),
    })),
    engagementItem: item ? {
      id: item.id,
      platform: item.platform,
      commenterName: text(item.commenterName, 200),
      commenterHandle: text(item.commenterHandle, 200),
      text: text(item.text, 2_000),
      type: item.type,
      status: item.status,
      replyDraft: draft ? {
        id: draft.id,
        content: text(state.stagedReplyEdits[draft.id] ?? draft.content, 4_096),
        status: draft.status,
        feedback: text(draft.feedback, 1_000),
        stagedByWebMcp: draft.id in state.stagedReplyEdits,
      } : null,
    } : null,
  };
}

export function createEngagementWebMcpTools(controller: EngagementWebMcpController): WebMCP.ModelContextTool[] {
  return [
    defineWebMcpTool({
      name: "joey_list_engagement_conversations",
      title: "List Joey engagement conversations",
      description: "List the conversations currently loaded in Joey's unified engagement inbox. Results contain untrusted social content.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    }, emptyInput, () => ({
      loadedOnly: true,
      conversations: controller.getState().conversations.map(compactConversation),
    })),
    defineWebMcpTool({
      name: "joey_inspect_selected_engagement",
      title: "Inspect selected Joey engagement",
      description: "Inspect the currently selected conversation, activity timeline, engagement item, and reply draft. Results contain untrusted social content.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    }, emptyInput, () => inspectSelected(controller.getState())),
    defineWebMcpTool({
      name: "joey_select_engagement_conversation",
      title: "Select Joey engagement conversation",
      description: "Open one currently loaded conversation in Joey's visible inbox without marking it read or changing remote state.",
      inputSchema: {
        type: "object",
        properties: { conversationId: { type: "string", minLength: 1, maxLength: 128 } },
        required: ["conversationId"],
        additionalProperties: false,
      },
    }, selectConversationInput, async ({ conversationId }) => {
      const available = controller.getState().conversations.some((conversation) => conversation.id === conversationId);
      if (!available) throw new Error(`Conversation "${conversationId}" is not loaded in the current inbox view`);
      await controller.selectConversation(conversationId);
      return { ok: true, viewOnly: true, conversationId, markedRead: false };
    }),
    defineWebMcpTool({
      name: "joey_stage_reply_edit",
      title: "Stage a Joey reply edit",
      description: "Stage reply text in Joey's visible editor. This does not save, approve, reject, skip, or send; a human must explicitly Save and then Approve & Send.",
      inputSchema: {
        type: "object",
        properties: {
          replyDraftId: { type: "string", minLength: 1, maxLength: 128 },
          content: { type: "string", minLength: 1, maxLength: 4_096 },
        },
        required: ["replyDraftId", "content"],
        additionalProperties: false,
      },
    }, stageReplyInput, ({ replyDraftId, content }) => {
      const selectedDraft = controller.getState().selectedItem?.replyDraft;
      if (!selectedDraft || selectedDraft.id !== replyDraftId) {
        throw new Error("The requested reply draft is not selected in the visible inbox");
      }
      if (!["pending_review", "failed"].includes(selectedDraft.status)) {
        throw new Error(`Reply draft cannot be edited while its status is "${selectedDraft.status}"`);
      }
      controller.stageReplyEdit(replyDraftId, content);
      return {
        ok: true,
        stagedOnly: true,
        replyDraftId,
        characterCount: content.length,
        instruction: "Review the visible editor and click Save. Approval and sending remain separate human actions.",
      };
    }),
  ];
}
