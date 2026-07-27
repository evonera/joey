import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { drafts } from "@/lib/db/schema";

export default defineTool({
  description: "Save a generated social media draft for the user to review.",
  parameters: z.object({
    platform: z.string().describe("The social media platform this draft is intended for (e.g., twitter, linkedin)."),
    content: z.string().describe("The content of the post."),
    mediaUrls: z.array(z.string()).optional().describe("Optional array of media URLs attached to the post."),
  }),
  execute: async ({ platform, content, mediaUrls }, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;

    if (!tenantId) {
      throw new Error("Unable to identify tenant from session auth.");
    }

    try {
      await db.insert(drafts).values({
        tenantId,
        content,
        platformOptions: { platform, mediaUrls },
        status: "pending_review",
      });
      return { success: true, message: "Draft saved successfully." };
    } catch (error: any) {
      throw new Error(`Failed to save draft: ${error.message}`);
    }
  },
});
