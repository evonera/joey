'use server';

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { replyDrafts, engagementItems, socialAccounts, tenants, agentConfigs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getZernioClient } from "./zernio";

async function getTenantId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.ownerId, session.user.id),
  });
  if (!tenant) throw new Error("No tenant found");
  return tenant.id;
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
    const tenantId = await getTenantId();

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
          ),
          orderBy: [desc(replyDrafts.createdAt)],
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
    const tenantId = await getTenantId();

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
    const tenantId = await getTenantId();

    await db.update(replyDrafts)
      .set({ status: "approved" })
      .where(and(eq(replyDrafts.id, replyDraftId), eq(replyDrafts.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to approve reply:", error);
    return { error: "Failed to approve reply" };
  }
}

export async function rejectReply(replyDraftId: string, feedback: string) {
  try {
    const tenantId = await getTenantId();

    await db.update(replyDrafts)
      .set({ status: "rejected", feedback })
      .where(and(eq(replyDrafts.id, replyDraftId), eq(replyDrafts.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to reject reply:", error);
    return { error: "Failed to reject reply" };
  }
}

export async function sendReply(replyDraftId: string) {
  try {
    const tenantId = await getTenantId();

    const draft = await db.query.replyDrafts.findFirst({
      where: and(eq(replyDrafts.id, replyDraftId), eq(replyDrafts.tenantId, tenantId)),
    });
    if (!draft) return { error: "Reply draft not found" };

    const item = await db.query.engagementItems.findFirst({
      where: eq(engagementItems.id, draft.engagementItemId),
    });
    if (!item) return { error: "Engagement item not found" };

    const { zernio } = await getZernioClient();

    const account = await db.query.socialAccounts.findFirst({
      where: and(
        eq(socialAccounts.tenantId, tenantId),
        eq(socialAccounts.platform, item.platform)
      ),
    });
    if (!account) return { error: `No connected account found for ${item.platform}` };

    const platformPostId = item.metadata as any;
    const postId = item.platformPostId || platformPostId?.comment?.postId;
    if (!postId) return { error: "No post ID available for reply" };

    let lastError: any = null;
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await zernio.comments.replyToInboxPost({
          path: { postId },
          body: {
            message: draft.content,
            ...(item.platformCommentId ? { parentCommentId: item.platformCommentId } : {}),
          },
        });

        if (response.error) throw response.error;

        await db.transaction(async (tx) => {
          await tx.update(replyDrafts)
            .set({ status: "sent", sentAt: new Date() })
            .where(eq(replyDrafts.id, replyDraftId));

          await tx.update(engagementItems)
            .set({ status: "replied" })
            .where(eq(engagementItems.id, item.id));
        });

        return { success: true };
      } catch (error: any) {
        lastError = error;
        const status = error?.status || error?.response?.status;
        if (status === 401 || status === 403) {
          await db.update(agentConfigs)
            .set({ isPaused: true })
            .where(eq(agentConfigs.tenantId, tenantId));
          break;
        }
        if (attempt < 3) await delay(1000 * attempt);
      }
    }

    return { error: lastError?.message || "Failed to send reply after retries" };
  } catch (error: any) {
    console.error("Failed to send reply:", error);
    return { error: error.message || "An unexpected error occurred" };
  }
}

export async function updateReplyDraft(replyDraftId: string, content: string) {
  try {
    const tenantId = await getTenantId();

    await db.update(replyDrafts)
      .set({ content })
      .where(and(eq(replyDrafts.id, replyDraftId), eq(replyDrafts.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to update reply draft:", error);
    return { error: "Failed to update reply" };
  }
}

export async function skipEngagementItem(itemId: string) {
  try {
    const tenantId = await getTenantId();

    await db.update(engagementItems)
      .set({ status: "skipped" })
      .where(and(eq(engagementItems.id, itemId), eq(engagementItems.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to skip engagement item:", error);
    return { error: "Failed to skip item" };
  }
}