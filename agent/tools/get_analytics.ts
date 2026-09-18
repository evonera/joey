import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";

export default defineTool({
  description: "Fetch published posts and their engagement metrics from the past week for analysis.",
  inputSchema: z.object({
    days: z.number().min(1).max(90).default(7).describe("Number of days to look back."),
    limit: z.number().min(1).max(100).default(20).describe("Max posts to return."),
  }),
  execute: async ({ days, limit }, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    if (!tenantId) throw new Error("Unable to identify tenant from session auth.");

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const recentPosts = await db.query.posts.findMany({
      where: and(
        eq(posts.tenantId, tenantId as string),
        eq(posts.status, "published"),
        gte(posts.publishedAt, since),
      ),
      orderBy: [desc(posts.publishedAt)],
      limit,
    });

    let totalViews = 0;
    let totalEngagements = 0;

    const postsData = recentPosts.map((p) => {
      const m = (p.metrics as Record<string, number> | null) || {};
      const views = m.views || m.impressions || 0;
      const engagements = (m.likes || 0) + (m.reposts || m.retweets || 0) + (m.comments || m.replies || 0);
      totalViews += views;
      totalEngagements += engagements;

      return {
        id: p.id,
        content: p.content.length > 160 ? p.content.slice(0, 160) + "..." : p.content,
        publishedAt: p.publishedAt?.toISOString(),
        views,
        engagements,
      };
    });

    // Sort by engagements to identify top performers for the model
    const topPerformers = [...postsData].sort((a, b) => b.engagements - a.engagements).slice(0, 5);

    return {
      period: { days, since: since.toISOString() },
      summary: {
        totalPosts: postsData.length,
        totalViews,
        totalEngagements,
        avgEngagementPerPost: postsData.length > 0 ? Math.round(totalEngagements / postsData.length) : 0,
      },
      topPerformers,
      samplePosts: postsData.slice(0, 8),
    };
  },
});
