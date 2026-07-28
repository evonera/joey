import { defineSchedule } from "eve/schedules";
import eveChannel from "../channels/eve";
import { db } from "@/lib/db";
import { agentConfigs, tenants, posts } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";

export default defineSchedule({
  cron: "0 8 * * 0",
  async run({ receive, waitUntil }) {
    const activeTenants = await db.select({
      tenantId: agentConfigs.tenantId,
      ownerId: tenants.ownerId,
    })
    .from(agentConfigs)
    .innerJoin(tenants, eq(tenants.id, agentConfigs.tenantId))
    .where(eq(agentConfigs.isPaused, false));

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const t of activeTenants) {
      try {
        const recentPosts = await db.query.posts.findFirst({
          where: and(
            eq(posts.tenantId, t.tenantId),
            gte(posts.publishedAt, oneWeekAgo),
          ),
          columns: { id: true },
        });
        if (!recentPosts) continue;

        waitUntil(
          receive(eveChannel, {
            message: "Time for your weekly strategy review. Analyze last week's published posts — their content, engagement metrics, and platform performance. Use `get_analytics` to fetch the data, then save your key observations with `remember` (type: strategy_insight). Focus on actionable patterns: best posting times, content themes that resonated, platform trends, and concrete recommendations for the coming week.",
            target: {},
            auth: {
              authenticator: "cron",
              principalType: "user",
              principalId: t.ownerId,
              attributes: { tenantId: t.tenantId },
            },
          })
        );
      } catch (err) {
        console.error(`[strategy-review] Failed to process tenant ${t.tenantId}:`, err);
      }
    }
  },
});
