import { defineTool } from "eve/tools";
import { z } from "zod";
import { queryAssets } from "@/lib/assets";

export default defineTool({
  description:
    "Search uploaded brand assets (images, videos, files) by name, tag, or type. Use this before drafting a post to find existing media to attach.",
  inputSchema: z.object({
    query: z.string().optional().describe("Search by filename."),
    tags: z.array(z.string()).optional().describe("Filter by tags (e.g. ['product', 'logo'])."),
    mimeType: z.string().optional().describe("Filter by MIME type (e.g. 'image/png', 'image/*', 'video/*')."),
    limit: z.number().min(1).max(50).default(10).describe("Max results to return."),
  }),
  execute: async ({ query, tags, mimeType, limit }, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;

    if (!tenantId) {
      throw new Error("Unable to identify tenant from session auth.");
    }

    const results = await queryAssets(tenantId as string, {
      search: query,
      tags,
      mimeType,
      limit,
    });

    return {
      assets: results.map((a) => ({
        id: a.id,
        filename: a.filename,
        publicUrl: a.publicUrl,
        mimeType: a.mimeType,
        size: a.size,
        width: a.width,
        height: a.height,
        tags: a.tags,
        altText: a.altText,
      })),
    };
  },
});
