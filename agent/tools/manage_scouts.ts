import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { scouts, scoutRuns } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { evaluateScout } from "@/lib/scouts/evaluator";

export default defineTool({
  description:
    "Manage Social Scouts for monitoring competitor/reference social accounts and theme pages (Instagram, TikTok, Twitter/X) via Apify. You can list, create, evaluate, or check alerts from scouts.",
  inputSchema: z.object({
    action: z.enum(["list", "create", "evaluate", "get_alert"]).describe("Action to perform."),
    scoutId: z.string().optional().describe("ID of the scout (required for evaluate or get_alert)."),
    name: z.string().optional().describe("Descriptive name for the scout (e.g. 'Pubity Viral Hooks')."),
    targetUrl: z.string().optional().describe("Target profile or page URL (e.g. 'https://instagram.com/pubity')."),
    platform: z.enum(["instagram", "tiktok", "twitter", "youtube", "web"]).default("instagram").describe("Social platform."),
    goalCondition: z.string().optional().describe("Natural language goal / trigger condition (e.g. 'Alert when a reel exceeds 50k views or uses a split-screen text hook')."),
    pollIntervalMinutes: z.number().min(15).max(1440).default(120).describe("How often to check in minutes."),
  }),
  execute: async ({ action, scoutId, name, targetUrl, platform, goalCondition, pollIntervalMinutes }, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    if (!tenantId) throw new Error("Unable to identify tenant from session auth.");

    switch (action) {
      case "list": {
        const rows = await db.query.scouts.findMany({
          where: eq(scouts.tenantId, tenantId as string),
          orderBy: [desc(scouts.createdAt)],
        });
        return {
          total: rows.length,
          scouts: rows.map((s) => ({
            id: s.id,
            name: s.name,
            targetUrl: s.targetUrl,
            platform: s.platform,
            goalCondition: s.goalCondition,
            isActive: s.isActive,
            pollIntervalMinutes: s.pollIntervalMinutes,
            lastPolledAt: s.lastPolledAt?.toISOString(),
            hasLatestAlert: !!s.latestAlert,
          })),
        };
      }

      case "create": {
        if (!name || !targetUrl || !goalCondition) {
          throw new Error("name, targetUrl, and goalCondition are required to create a scout.");
        }

        const [created] = await db
          .insert(scouts)
          .values({
            tenantId: tenantId as string,
            name,
            targetUrl,
            platform,
            goalCondition,
            pollIntervalMinutes,
          })
          .returning();

        return {
          message: `Scout '${name}' created successfully.`,
          scout: created,
        };
      }

      case "evaluate": {
        if (!scoutId) throw new Error("scoutId is required to evaluate a scout.");
        const scout = await db.query.scouts.findFirst({
          where: and(eq(scouts.id, scoutId), eq(scouts.tenantId, tenantId as string)),
        });
        if (!scout) throw new Error("Scout not found.");

        const result = await evaluateScout(scoutId);
        return {
          scoutId,
          name: scout.name,
          triggered: result.triggered,
          itemsChecked: result.itemsFound,
          alert: result.alert,
          error: result.error,
        };
      }

      case "get_alert": {
        if (!scoutId) throw new Error("scoutId is required to get scout alert.");
        const scout = await db.query.scouts.findFirst({
          where: and(eq(scouts.id, scoutId), eq(scouts.tenantId, tenantId as string)),
        });
        if (!scout) throw new Error("Scout not found.");

        return {
          scoutId: scout.id,
          name: scout.name,
          goal: scout.goalCondition,
          latestAlert: scout.latestAlert,
          lastPolledAt: scout.lastPolledAt?.toISOString(),
        };
      }
    }
  },
});
