'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  replyDrafts,
  engagementItems,
  socialAccounts,
  tenants,
  agentConfigs,
  engagementActivities,
  engagementConversations,
} from "@/lib/db/schema";
import { eq, and, desc, asc, inArray, ilike, lt, or } from "drizzle-orm";
import { getZernioClient } from "./zernio";
import { syncZernioInboxBackfill } from "@/lib/engagement-inbox";
import { checkRateLimit } from "@/lib/rate-limit";

export type UnifiedInboxConversation = {
  id: string;
  platform: string;
  kind: string;
  participantName: string | null;
  participantHandle: string | null;
  participantAvatar: string | null;
  status: string;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastActivityAt: Date;
};

export type UnifiedInboxActivity = {
  id: string;
  type: string;
  direction: string;
  body: string | null;
  actorName: string | null;
  actorHandle: string | null;
  actorAvatar: string | null;
  attachments: Array<Record<string, unknown>> | null;
  deliveryStatus: string | null;
  isRead: boolean;
  isDeleted: boolean;
  occurredAt: Date;
};

export async function getUnifiedInbox(input: {
  status?: string;
  kind?: string;
  search?: string;
  cursor?: string;
  selectedConversationId?: string;
  limit?: number;
} = {}) {
  try {
    const tenantId = await getActiveTenantId();
    const limit = Math.min(Math.max(input.limit ?? 30, 1), 50);
    const conditions = [eq(engagementConversations.tenantId, tenantId)];
    if (input.status && input.status !== "all") conditions.push(eq(engagementConversations.status, input.status));
    if (input.kind && input.kind !== "all") conditions.push(eq(engagementConversations.kind, input.kind));
    if (input.cursor) {
      const [cursorTime, cursorId] = input.cursor.split("|");
      const cursor = new Date(cursorTime);
      if (!Number.isNaN(cursor.getTime()) && cursorId) {
        conditions.push(or(
          lt(engagementConversations.lastActivityAt, cursor),
          and(eq(engagementConversations.lastActivityAt, cursor), lt(engagementConversations.id, cursorId)),
        )!);
      }
    }
    const search = input.search?.trim();
    if (search) {
      const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      conditions.push(or(
        ilike(engagementConversations.participantName, pattern),
        ilike(engagementConversations.participantHandle, pattern),
        ilike(engagementConversations.lastMessagePreview, pattern),
      )!);
    }

    const rows = await db.query.engagementConversations.findMany({
      where: and(...conditions),
      orderBy: [desc(engagementConversations.lastActivityAt), desc(engagementConversations.id)],
      limit: limit + 1,
      columns: {
        id: true,
        platform: true,
        kind: true,
        participantName: true,
        participantHandle: true,
        participantAvatar: true,
        status: true,
        unreadCount: true,
        lastMessagePreview: true,
        lastActivityAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const conversations = rows.slice(0, limit);
    const selectedConversationId = input.selectedConversationId ?? conversations[0]?.id;
    const selected = selectedConversationId
      ? await db.query.engagementConversations.findFirst({
          where: and(
            eq(engagementConversations.id, selectedConversationId),
            eq(engagementConversations.tenantId, tenantId),
          ),
          columns: {
            id: true,
            platform: true,
            kind: true,
            participantName: true,
            participantHandle: true,
            participantAvatar: true,
            status: true,
            unreadCount: true,
            lastMessagePreview: true,
            lastActivityAt: true,
          },
        })
      : undefined;
    const activities = selected
      ? await db.query.engagementActivities.findMany({
          where: and(
            eq(engagementActivities.tenantId, tenantId),
            eq(engagementActivities.conversationId, selected.id),
          ),
          orderBy: [asc(engagementActivities.occurredAt), asc(engagementActivities.id)],
          limit: 100,
          columns: {
            id: true,
            type: true,
            direction: true,
            body: true,
            actorName: true,
            actorHandle: true,
            actorAvatar: true,
            attachments: true,
            deliveryStatus: true,
            isRead: true,
            isDeleted: true,
            occurredAt: true,
          },
        })
      : [];
    const selectedItem = selected
      ? await db.query.engagementItems.findFirst({
          where: and(
            eq(engagementItems.tenantId, tenantId),
            eq(engagementItems.conversationId, selected.id),
          ),
          orderBy: [desc(engagementItems.createdAt)],
        })
      : undefined;
    const selectedDraft = selectedItem
      ? await db.query.replyDrafts.findFirst({
          where: and(
            eq(replyDrafts.tenantId, tenantId),
            eq(replyDrafts.engagementItemId, selectedItem.id),
          ),
          orderBy: [desc(replyDrafts.createdAt)],
        })
      : undefined;

    return {
      conversations,
      selectedConversation: selected ?? null,
      activities,
      selectedEngagementItem: selectedItem ? {
        id: selectedItem.id,
        platform: selectedItem.platform,
        platformPostId: selectedItem.platformPostId,
        platformCommentId: selectedItem.platformCommentId,
        commenterName: selectedItem.commenterName,
        commenterHandle: selectedItem.commenterHandle,
        commenterAvatar: selectedItem.commenterAvatar,
        text: selectedItem.text,
        type: selectedItem.type,
        status: selectedItem.status,
        createdAt: selectedItem.createdAt,
        replyDraft: selectedDraft ? {
          id: selectedDraft.id,
          content: selectedDraft.content,
          status: selectedDraft.status,
          feedback: selectedDraft.feedback,
          createdAt: selectedDraft.createdAt,
        } : null,
      } : null,
      nextCursor: hasMore && conversations.at(-1)
        ? `${conversations.at(-1)!.lastActivityAt.toISOString()}|${conversations.at(-1)!.id}`
        : null,
    };
  } catch (error) {
    console.error("Failed to load unified inbox:", error);
    return { error: "Failed to load unified inbox" };
  }
}

export async function markConversationRead(conversationId: string) {
  try {
    const tenantId = await getActiveTenantId();
    const conversation = await db.query.engagementConversations.findFirst({
      where: and(
        eq(engagementConversations.id, conversationId),
        eq(engagementConversations.tenantId, tenantId),
      ),
      columns: { id: true, kind: true, externalConversationId: true, socialAccountId: true },
    });
    if (!conversation) return { error: "Conversation not found" };
    if (conversation.kind === "dm" && conversation.socialAccountId) {
      const account = await db.query.socialAccounts.findFirst({
        where: and(
          eq(socialAccounts.id, conversation.socialAccountId),
          eq(socialAccounts.tenantId, tenantId),
        ),
        columns: { platformAccountId: true },
      });
      if (account) {
        const { zernio } = await getZernioClient();
        const remote = await zernio.messages.markConversationRead({
          path: { conversationId: conversation.externalConversationId },
          body: { accountId: account.platformAccountId },
        });
        if (remote.error) throw remote.error;
      }
    }
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(engagementConversations)
        .set({ unreadCount: 0, updatedAt: new Date() })
        .where(and(
          eq(engagementConversations.id, conversationId),
          eq(engagementConversations.tenantId, tenantId),
        ))
        .returning({ id: engagementConversations.id });
      if (!updated) throw new Error("Conversation not found");
      await tx.update(engagementActivities)
        .set({ isRead: true, updatedAt: new Date() })
        .where(and(
          eq(engagementActivities.conversationId, conversationId),
          eq(engagementActivities.tenantId, tenantId),
          eq(engagementActivities.direction, "incoming"),
        ));
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to mark conversation read:", error);
    return { error: "Failed to mark conversation read" };
  }
}

export async function syncUnifiedInbox() {
  try {
    const tenantId = await getActiveTenantId();
    const rateLimit = await checkRateLimit(`engagement-sync:${tenantId}`, 1, 60_000);
    if (!rateLimit.allowed) return { error: "Inbox sync is limited to one request per minute" };
    return { success: true, ...(await syncZernioInboxBackfill(tenantId)) };
  } catch (error) {
    console.error("Failed to sync unified inbox:", error);
    return { error: "Failed to sync inbox from Zernio" };
  }
}

export type EngagementItemWithReply = {
  id: string;
  platform: string;
  platformPostId: string | null;
  platformCommentId: string | null;
  commenterName: string | null;
  commenterHandle: string | null;
  commenterAvatar: string | null;
  text: string;
  type: string;
  status: string;
  createdAt: Date;
  replyDraft: {
    id: string;
    content: string;
    status: string;
    feedback: string | null;
    createdAt: Date;
  } | null;
};

export async function getEngagementItems(status?: string) {
  try {
    const tenantId = await getActiveTenantId();

    const baseConditions = [eq(engagementItems.tenantId, tenantId)];
    if (status) {
      baseConditions.push(eq(engagementItems.status, status));
    }

    const items = await db.query.engagementItems.findMany({
      where: and(...baseConditions),
      orderBy: [desc(engagementItems.createdAt)],
    });

    const replyDraftIds = items.map((i) => i.id);
    const drafts = replyDraftIds.length > 0
      ? await db.query.replyDrafts.findMany({
          where: and(
            eq(replyDrafts.tenantId, tenantId),
            inArray(replyDrafts.engagementItemId, replyDraftIds),
          ),
          orderBy: [asc(replyDrafts.createdAt)],
        })
      : [];

    const draftByItemId = new Map(drafts.map((d) => [d.engagementItemId, d]));

    return {
      items: items.map((item) => {
        const reply = draftByItemId.get(item.id);
        return {
          id: item.id,
          platform: item.platform,
          platformPostId: item.platformPostId,
          platformCommentId: item.platformCommentId,
          commenterName: item.commenterName,
          commenterHandle: item.commenterHandle,
          commenterAvatar: item.commenterAvatar,
          text: item.text,
          type: item.type,
          status: item.status,
          createdAt: item.createdAt,
          replyDraft: reply
            ? {
                id: reply.id,
                content: reply.content,
                status: reply.status,
                feedback: reply.feedback,
                createdAt: reply.createdAt,
              }
            : null,
        };
      }),
    };
  } catch (error: any) {
    console.error("Failed to fetch engagement items:", error);
    return { error: "Failed to load engagement inbox" };
  }
}

export async function getPendingReplyCount() {
  try {
    const tenantId = await getActiveTenantId();

    const items = await db.query.engagementItems.findMany({
      where: and(
        eq(engagementItems.tenantId, tenantId),
        eq(engagementItems.status, "pending")
      ),
      columns: { id: true },
    });

    return { count: items.length };
  } catch {
    return { count: 0 };
  }
}

export async function approveReply(replyDraftId: string) {
  try {
    const tenantId = await getActiveTenantId();

    const [approved] = await db.update(replyDrafts)
      .set({ status: "approved" })
      .where(and(
        eq(replyDrafts.id, replyDraftId),
        eq(replyDrafts.tenantId, tenantId),
        inArray(replyDrafts.status, ["pending_review", "rejected", "failed"]),
      ))
      .returning({ id: replyDrafts.id });

    if (!approved) return { error: "Reply is no longer available for approval" };

    return { success: true };
  } catch (error: any) {
    console.error("Failed to approve reply:", error);
    return { error: "Failed to approve reply" };
  }
}

export async function rejectReply(replyDraftId: string, feedback: string) {
  try {
    const tenantId = await getActiveTenantId();

    const [rejected] = await db.update(replyDrafts)
      .set({ status: "rejected", feedback })
      .where(and(
        eq(replyDrafts.id, replyDraftId),
        eq(replyDrafts.tenantId, tenantId),
        eq(replyDrafts.status, "pending_review"),
      ))
      .returning({ id: replyDrafts.id });

    if (!rejected) return { error: "Reply is no longer pending review" };

    return { success: true };
  } catch (error: any) {
    console.error("Failed to reject reply:", error);
    return { error: "Failed to reject reply" };
  }
}

export async function sendReply(replyDraftId: string) {
  try {
    const tenantId = await getActiveTenantId();

    // Claim the approved draft before performing the external side effect. This
    // compare-and-swap prevents double clicks and concurrent workers from sending
    // the same reply more than once.
    const [draft] = await db.update(replyDrafts)
      .set({ status: "sending", sendClaimedAt: new Date() })
      .where(and(
        eq(replyDrafts.id, replyDraftId),
        eq(replyDrafts.tenantId, tenantId),
        eq(replyDrafts.status, "approved"),
      ))
      .returning();
    if (!draft) return { error: "Reply must be approved and not already sending" };

    try {
      const item = await db.query.engagementItems.findFirst({
      where: and(
        eq(engagementItems.id, draft.engagementItemId),
        eq(engagementItems.tenantId, tenantId),
      ),
    });
    if (!item) {
      await db.update(replyDrafts)
          .set({ status: "failed", sendClaimedAt: null })
        .where(and(
          eq(replyDrafts.id, replyDraftId),
          eq(replyDrafts.tenantId, tenantId),
          eq(replyDrafts.status, "sending"),
        ));
      return { error: "Engagement item not found" };
    }

      const { zernio } = await getZernioClient();

      const account = await db.query.socialAccounts.findFirst({
      where: and(
        eq(socialAccounts.tenantId, tenantId),
        item.socialAccountId
          ? eq(socialAccounts.id, item.socialAccountId)
          : eq(socialAccounts.platform, item.platform),
      ),
    });
      if (!account) throw new Error(`No connected account found for ${item.platform}`);

      const platformPostId = item.metadata as any;
      const postId = item.platformPostId || platformPostId?.comment?.postId;
      if (!postId) throw new Error("No post ID available for reply");

      const response = await zernio.comments.replyToInboxPost({
        path: { postId },
        headers: { "Idempotency-Key": `engagement-reply:${replyDraftId}` },
        body: {
          accountId: account.platformAccountId,
          message: draft.content,
          ...(item.platformCommentId ? { commentId: item.platformCommentId } : {}),
        },
      });

      if (response.error) throw response.error;

      await db.transaction(async (tx) => {
        await tx.update(replyDrafts)
          .set({ status: "sent", sentAt: new Date(), sendClaimedAt: null })
          .where(and(
            eq(replyDrafts.id, replyDraftId),
            eq(replyDrafts.tenantId, tenantId),
            eq(replyDrafts.status, "sending"),
          ));

        await tx.update(engagementItems)
          .set({ status: "replied" })
          .where(and(
            eq(engagementItems.id, item.id),
            eq(engagementItems.tenantId, tenantId),
          ));
      });

      return { success: true };
    } catch (error: any) {
      const status = error?.status || error?.response?.status;
      await db.update(replyDrafts)
        .set({ status: "failed", sendClaimedAt: null })
        .where(and(
          eq(replyDrafts.id, replyDraftId),
          eq(replyDrafts.tenantId, tenantId),
          eq(replyDrafts.status, "sending"),
        ));

      if (status === 401 || status === 403) {
        try {
          await db.update(agentConfigs)
            .set({ isPaused: true })
            .where(eq(agentConfigs.tenantId, tenantId));
        } catch (pauseError) {
          console.error("Failed to pause agent after Zernio authorization error:", pauseError);
        }
      }

      return { error: error?.message || "Failed to send reply" };
    }
  } catch (error: any) {
    console.error("Failed to send reply:", error);
    return { error: error.message || "An unexpected error occurred" };
  }
}

export async function updateReplyDraft(replyDraftId: string, content: string) {
  try {
    const tenantId = await getActiveTenantId();

    const normalizedContent = content.trim();
    if (!normalizedContent) return { error: "Reply cannot be empty" };

    const [updated] = await db.update(replyDrafts)
      .set({ content: normalizedContent })
      .where(and(
        eq(replyDrafts.id, replyDraftId),
        eq(replyDrafts.tenantId, tenantId),
        inArray(replyDrafts.status, ["pending_review", "rejected", "failed"]),
      ))
      .returning({ id: replyDrafts.id });

    if (!updated) return { error: "Reply can no longer be edited" };

    return { success: true };
  } catch (error: any) {
    console.error("Failed to update reply draft:", error);
    return { error: "Failed to update reply" };
  }
}

export async function skipEngagementItem(itemId: string) {
  try {
    const tenantId = await getActiveTenantId();

    await db.update(engagementItems)
      .set({ status: "skipped" })
      .where(and(eq(engagementItems.id, itemId), eq(engagementItems.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to skip engagement item:", error);
    return { error: "Failed to skip item" };
  }
}
