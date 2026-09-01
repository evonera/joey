import { db } from "@/lib/db";
import { dmAutomationRules } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getZernioClientForTenant } from "@/lib/publisher-core";

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
  error?: string;
}

/**
 * Checks incoming post comments against active keyword DM automation rules and triggers response.
 */
export async function handleCommentWebhook(event: CommentWebhookEvent): Promise<DmDispatchResult> {
  const { tenantId, themePageId, commentText, authorUsername } = event;

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

  // Look for keyword match
  const cleanComment = commentText.toUpperCase();

  for (const rule of rules) {
    const keyword = rule.triggerValue.toUpperCase();
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, "i");

    if (regex.test(cleanComment)) {
      // Build interpolated message
      const message = rule.responseTemplate
        .replace(/\{\{username\}\}/gi, `@${authorUsername}`)
        .replace(/\{\{link\}\}/gi, rule.responseLink || "");

      const currentStats = (rule.stats as any) || { triggered: 0, dmsSent: 0, clicks: 0 };
      try {
        if (event.platform !== "instagram" && event.platform !== "facebook") {
          throw new Error("Private comment replies are supported only for Instagram and Facebook");
        }
        const { zernio } = await getZernioClientForTenant(tenantId);
        const response = await zernio.comments.sendPrivateReplyToComment({
          path: { postId: event.postId, commentId: event.commentId },
          body: {
            accountId: event.accountId,
            message,
            ...(rule.responseLink
              ? { buttons: [{ type: "url" as const, title: "Open link", url: rule.responseLink }] }
              : {}),
          },
        });
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
          triggerKeyword: rule.triggerValue,
          dispatchedMessage: message,
          destinationLink: rule.responseLink || undefined,
          success: true,
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
          triggerKeyword: rule.triggerValue,
          success: false,
          error: error instanceof Error ? error.message : "Private reply failed",
        };
      }
    }
  }

  return { matched: false, success: true };
}
