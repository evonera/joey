import { defineTool } from "eve/tools";
import { assertGeneralWorkspaceTool } from "../lib/agency-session";
import { requireWorkspaceRole } from "../lib/require-workspace-role";
import { z } from "zod";
import { draftReplyForItem } from "@/lib/reply-drafts";

export default defineTool({
  description:
    "Draft a reply to an inbound social media comment or mention. Use this when a comment needs a response. Saves the draft for user review before sending.",
  inputSchema: z.object({
    engagementItemId: z.string().describe("The ID of the engagement item (comment/mention) to reply to."),
    content: z.string().describe("The reply text to send. Must be on-brand and appropriate for the platform."),
    tone: z.string().optional().describe("Optional tone hint, e.g. 'friendly', 'professional', 'humorous'."),
  }),
  execute: async ({ engagementItemId, content, tone }, ctx) => {
    assertGeneralWorkspaceTool(ctx.session);
    await requireWorkspaceRole(ctx.session.auth.current, ["owner", "admin", "editor", "member"]);
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    if (!tenantId) {
      throw new Error("Unable to identify tenant from session auth.");
    }
    if (typeof tenantId !== "string") {
      throw new Error("Invalid tenant identity in session auth.");
    }

    const result = await draftReplyForItem(tenantId, engagementItemId, content, tone || null);
    if (!("created" in result) || !result.created) return result;

    const { createNotification } = await import('@/lib/notifications');
    await createNotification(tenantId, 'engagement_reply_needed', 'Comment Needs Reply', 'Your AI agent has drafted a reply to a comment for your review.', { link: '/engagement' });

    return result;
  },
});
