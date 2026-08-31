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
} from "@/lib/db/schema";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { getZernioClient } from "./zernio";

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
      .set({ status: "sending" })
      .where(and(
        eq(replyDrafts.id, replyDraftId),
        eq(replyDrafts.tenantId, tenantId),
        eq(replyDrafts.status, "approved"),
      ))
      .returning();
    if (!draft) return { error: "Reply must be approved and not already sending" };

    const item = await db.query.engagementItems.findFirst({
      where: and(
        eq(engagementItems.id, draft.engagementItemId),
        eq(engagementItems.tenantId, tenantId),
      ),
    });
    if (!item) {
      await db.update(replyDrafts)
        .set({ status: "failed" })
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
    if (!account) {
      await db.update(replyDrafts)
        .set({ status: "failed" })
        .where(and(eq(replyDrafts.id, replyDraftId), eq(replyDrafts.tenantId, tenantId)));
      return { error: `No connected account found for ${item.platform}` };
    }

    const platformPostId = item.metadata as any;
    const postId = item.platformPostId || platformPostId?.comment?.postId;
    if (!postId) {
      await db.update(replyDrafts)
        .set({ status: "failed" })
        .where(and(eq(replyDrafts.id, replyDraftId), eq(replyDrafts.tenantId, tenantId)));
      return { error: "No post ID available for reply" };
    }

    try {
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
          .set({ status: "sent", sentAt: new Date() })
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
      if (status === 401 || status === 403) {
        await db.update(agentConfigs)
          .set({ isPaused: true })
          .where(eq(agentConfigs.tenantId, tenantId));
      }
      await db.update(replyDrafts)
        .set({ status: "failed" })
        .where(and(
          eq(replyDrafts.id, replyDraftId),
          eq(replyDrafts.tenantId, tenantId),
          eq(replyDrafts.status, "sending"),
        ));

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
