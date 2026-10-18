import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { scouts, scoutEvaluations } from "@/lib/db/schema";
import { isPublicScoutHttpsUrl, validateScoutSource } from "./source-validation";
import { canonicalScoutPostUrl } from "./post-evidence";
import { reserveScoutEvaluation, scoutConfigurationKey } from "./evaluation-receipts";

export const connectorObservationSchema = z.object({
  version: z.literal(1), scoutId: z.uuid(), targetUrl: z.string().max(2048),
  platform: z.enum(["instagram", "tiktok", "twitter", "youtube", "web", "rss"]),
  items: z.array(z.object({
    id: z.string().trim().min(1).max(120), url: z.string().max(2048).refine(isPublicScoutHttpsUrl),
    text: z.string().max(6000), views: z.number().finite().min(0).max(1e12).optional(),
    likes: z.number().finite().min(0).max(1e12).optional(), timestamp: z.iso.datetime({ offset: true }).optional(),
  }).strict()).min(1).max(15),
}).strict();

/** Readiness is scoped to the exact saved Scout configuration, not the tenant. */
export async function findConnectorEvidence(tenantId: string, source: { id?: string; targetUrl: string; platform: string; goalCondition?: string }) {
  const scout = await db.query.scouts.findFirst({ where: and(eq(scouts.tenantId, tenantId), eq(scouts.targetUrl, source.targetUrl), eq(scouts.platform, source.platform), ...(source.id ? [eq(scouts.id, source.id)] : []), ...(source.goalCondition ? [eq(scouts.goalCondition, source.goalCondition)] : [])) });
  if (!scout) return undefined;
  const receipt = await db.query.scoutEvaluations.findFirst({
    where: and(eq(scoutEvaluations.tenantId, tenantId), eq(scoutEvaluations.scoutId, scout.id), eq(scoutEvaluations.configKey, scoutConfigurationKey(scout)),
      inArray(scoutEvaluations.status, ["pending", "running", "completed"]), sql`${scoutEvaluations.eventKey} LIKE 'connector:%'`,
      sql`${scoutEvaluations.items} IS NOT NULL`,
      sql`${scoutEvaluations.createdAt} > (clock_timestamp() AT TIME ZONE 'UTC') - ${Math.max(30, scout.pollIntervalMinutes * 2)} * interval '1 minute'`),
    orderBy: [desc(scoutEvaluations.createdAt)],
  });
  return receipt;
}

/** Connector data cannot approve, publish, or supply a judgement. Joey owns those steps. */
export async function receiveConnectorObservation(tenantId: string, input: z.infer<typeof connectorObservationSchema>) {
  const value = connectorObservationSchema.parse(input);
  const scout = await db.query.scouts.findFirst({ where: and(eq(scouts.id, value.scoutId), eq(scouts.tenantId, tenantId)) });
  if (!scout) throw new Error("Scout not found.");
  const targetUrl = validateScoutSource(value.targetUrl, value.platform);
  if (scout.targetUrl !== targetUrl || scout.platform !== value.platform) throw new Error("Scout source changed. Refresh its configuration before collecting again.");
  const items = value.items.map(item => ({ ...item, url: canonicalScoutPostUrl(item.url)! }));
  for (const item of items) {
    validateScoutSource(item.url, scout.platform);
    if (["instagram", "tiktok", "twitter", "youtube"].includes(scout.platform) && item.url === canonicalScoutPostUrl(scout.targetUrl)) {
      if (!/\/(?:p|reel|status|video|shorts|live|embed)\/|[?&]v=/.test(item.url) && !item.url.startsWith("https://youtu.be/")) throw new Error("Social observations require individual post URLs, not profile URLs.");
    }
  }
  if (new Set(items.map(item => item.id)).size !== items.length || new Set(items.map(item => item.url)).size !== items.length) throw new Error("Observation contains duplicate post identities.");
  const digest = createHash("sha256").update(JSON.stringify(items)).digest("hex");
  const receipt = await reserveScoutEvaluation(scout, `connector:${digest}:${Math.floor(Date.now() / (scout.pollIntervalMinutes * 60_000))}`);
  if (receipt.status !== "pending" || receipt.phase !== "preparing" || receipt.items) return { evaluationId: receipt.id, status: receipt.status, reused: true };
  const [saved] = await db.update(scoutEvaluations).set({ phase: "collected", items: items.map(item => ({ ...item, observedAt: new Date().toISOString() })), updatedAt: new Date() })
    .where(and(eq(scoutEvaluations.id, receipt.id), eq(scoutEvaluations.tenantId, tenantId), eq(scoutEvaluations.status, "pending"), eq(scoutEvaluations.phase, "preparing"), sql`${scoutEvaluations.items} IS NULL`,
      sql`EXISTS (SELECT 1 FROM ${scouts} WHERE ${scouts.id} = ${scout.id} AND ${scouts.tenantId} = ${tenantId} AND ${scouts.targetUrl} = ${targetUrl} AND ${scouts.platform} = ${value.platform} AND ${scouts.goalCondition} = ${scout.goalCondition})`
    )).returning({ id: scoutEvaluations.id });
  if (!saved) throw new Error("Scout or its evaluation changed before evidence was saved. Refresh and try again.");
  return { evaluationId: saved.id, status: "pending", reused: false };
}
