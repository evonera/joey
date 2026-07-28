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

    const postsData = recentPosts.map(p => ({
      id: p.id,
      content: p.content.length > 200 ? p.content.slice(0, 200) + "..." : p.content,
      publishedAt: p.publishedAt?.toISOString(),
      metrics: p.metrics,
    }));

    const totalPosts = postsData.length;
    const withMetrics = postsData.filter(p => p.metrics);

    return {
      period: { days, since: since.toISOString() },
      summary: {
        totalPosts,
        postsWithMetrics: withMetrics.length,
      },
      posts: postsData,
    };
  },
});
