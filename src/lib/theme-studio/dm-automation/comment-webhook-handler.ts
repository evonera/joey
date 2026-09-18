import { db } from "@/lib/db";
import { dmAutomationRules, themePages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getZernioClientForTenant } from "@/lib/publisher-core";
import { createHash } from "node:crypto";

import { matchCommentRuleSemantically } from "@/lib/typesafe";

class PermanentDmDispatchError extends Error {}

export interface CommentWebhookEvent {
  tenantId: string;
  themePageId: string;
  accountId: string;
  platform: string;
  postId: string;
  commentId: string;
  authorUsername: string;
  authorId: string;
  commentText: string;
}

export interface DmDispatchResult {
  matched: boolean;
  ruleId?: string;
  triggerKeyword?: string;
  dispatchedMessage?: string;
  destinationLink?: string;
  success: boolean;
  retryable?: boolean;
  providerMessageId?: string;
  error?: string;
}

type DmRuleRecord = typeof dmAutomationRules.$inferSelect;

async function dispatchDmReply(
  event: CommentWebhookEvent,
  rule: DmRuleRecord,
  triggerKeyword: string,
): Promise<DmDispatchResult> {
  const { tenantId, authorUsername } = event;
  const message = rule.responseTemplate
    .replace(/\{\{username\}\}/gi, `@${authorUsername}`)
    .replace(/\{\{link\}\}/gi, rule.responseLink || "");

  const currentStats = (rule.stats as any) || { triggered: 0, dmsSent: 0, clicks: 0 };
  try {
    if (event.platform !== "instagram" && event.platform !== "facebook") {
      throw new PermanentDmDispatchError("Private comment replies are supported only for Instagram and Facebook");
    }
    const { zernio } = await getZernioClientForTenant(tenantId);
    const response = await zernio.comments.sendPrivateReplyToComment({
      headers: {
        "x-request-id": createHash("sha256")
          .update(`${tenantId}:${rule.id}:${event.commentId}`)
          .digest("hex"),
      },
      path: { postId: event.postId, commentId: event.commentId },
      body: {
        accountId: event.accountId,
        message,
        ...(rule.responseLink
          ? { buttons: [{ type: "url" as const, title: "Open link", url: rule.responseLink }] }
          : {}),
      },
    });
    const responseCode = response.error && typeof response.error === "object" && "code" in response.error
      ? response.error.code
      : undefined;
    if (responseCode === "PLATFORM_LIMITATION") {
      throw new PermanentDmDispatchError("The platform does not allow a private reply for this comment");
    }
    if (response.error || !response.data?.messageId) {
      throw new Error("Zernio did not confirm the private reply");
    }

    await db.update(dmAutomationRules).set({
      stats: {
        ...currentStats,
        triggered: (currentStats.triggered || 0) + 1,
        dmsSent: (currentStats.dmsSent || 0) + 1,
      },
      updatedAt: new Date(),
    }).where(and(eq(dmAutomationRules.id, rule.id), eq(dmAutomationRules.tenantId, tenantId)));

    return {
      matched: true,
      ruleId: rule.id,
      triggerKeyword,
      dispatchedMessage: message,
      destinationLink: rule.responseLink || undefined,
      success: true,
      retryable: false,
      providerMessageId: response.data.messageId,
    };
  } catch (error) {
    await db.update(dmAutomationRules).set({
      stats: {
        ...currentStats,
        triggered: (currentStats.triggered || 0) + 1,
        dmsFailed: (currentStats.dmsFailed || 0) + 1,
      },
      updatedAt: new Date(),
    }).where(and(eq(dmAutomationRules.id, rule.id), eq(dmAutomationRules.tenantId, tenantId)));
    return {
      matched: true,
      ruleId: rule.id,
      triggerKeyword,
      success: false,
      retryable: !(error instanceof PermanentDmDispatchError),
      error: error instanceof Error ? error.message : "Private reply failed",
    };
  }
}

/**
 * Checks incoming post comments against active keyword DM automation rules and triggers response.
 * Uses exact regex matching as the fast-path, falling back to TypeSafe Jev System One for semantic intent matching.
 */
export async function handleCommentWebhook(event: CommentWebhookEvent): Promise<DmDispatchResult> {
  const { tenantId, themePageId, commentText } = event;

  const rules = await db.query.dmAutomationRules.findMany({
    where: and(
      eq(dmAutomationRules.themePageId, themePageId),
      eq(dmAutomationRules.tenantId, tenantId),
      eq(dmAutomationRules.isActive, true)
    ),
  });

  if (rules.length === 0) {
    return { matched: false, success: true };
  }

  // 1. Fast-path: check exact keyword match with word boundaries
  const cleanComment = commentText.toUpperCase();

  for (const rule of rules) {
    const keyword = rule.triggerValue.toUpperCase();
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, "i");

    if (regex.test(cleanComment)) {
      return dispatchDmReply(event, rule, rule.triggerValue);
    }
  }

  // 2. Semantic fallback: evaluate comment intent via TypeSafe Jev System One
  const page = await db.query.themePages.findFirst({
    where: and(eq(themePages.id, themePageId), eq(themePages.tenantId, tenantId)),
    columns: { name: true, niche: true, audience: true },
  });

  const semanticMatch = await matchCommentRuleSemantically(commentText, rules, tenantId, {
    pageContext: page ? { name: page.name, niche: page.niche, audience: page.audience } : undefined,
  });
  if (semanticMatch) {
    return dispatchDmReply(event, semanticMatch, `${semanticMatch.triggerValue} (semantic)`);
  }

  return { matched: false, success: true };
}
