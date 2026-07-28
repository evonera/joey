import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { drafts } from "@/lib/db/schema";

export default defineTool({
  description: "Save a generated social media draft for the user to review.",
  inputSchema: z.object({
    platform: z.string().describe("The social media platform this draft is intended for (e.g., twitter, linkedin)."),
    variants: z.array(z.object({
      name: z.string().describe("The name of the variant (e.g., 'Professional', 'Bold', 'Data-Driven')."),
      content: z.string().describe("The content of the variant."),
    })).length(3).describe("An array of exactly 3 distinct variants of the post."),
    mediaUrls: z.array(z.string()).optional().describe("Optional array of media URLs attached to the post."),
  }),
  execute: async ({ platform, variants, mediaUrls }, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;

    if (!tenantId) {
      throw new Error("Unable to identify tenant from session auth.");
    }

    try {
      await db.insert(drafts).values({
        tenantId: tenantId as string,
        variants,
        platformOptions: { platform, mediaUrls },
        status: "pending_review",
      });
      
      const { createNotification } = await import('@/lib/notifications');
      await createNotification(tenantId as string, 'draft_ready', 'New Draft Ready', 'Your AI agent has drafted a new post for your review.', { link: '/drafts' });

      return { success: true, message: "Draft saved successfully." };
    } catch (error: any) {
      throw new Error(`Failed to save draft: ${error.message}`);
    }
  },
});
