import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagementItems, webhookEvents } from "@/lib/db/schema";

/**
 * Atomic dispatch claims for shared cron work (Phase 2).
 *
 * Overlapping scheduler invocations (Vercel retries, eve + /api/cron firing
 * together) must never double-dispatch the same engagement item or webhook
 * event. Claims are single-statement CTEs using `FOR UPDATE SKIP LOCKED`:
 * exactly one worker wins each row, and because each claim is a single
 * implicit-transaction statement it works on every configured driver
 * (Neon WebSocket pool, neon-http, postgres-js) with no interactive
 * transaction required.
 *
 * Claimed rows sit in a transient `dispatching` status with a refreshed
 * `updated_at` lease. Terminal paths flip them to a final status; anything
 * stranded by a crash is reset to `pending` by the recover functions at the
 * start of the next tick.
 */

export const DISPATCH_STALE_AFTER_MS = 10 * 60_000;
export const DISPATCH_BATCH_LIMIT = 20;

/** Bound for any tenant-controlled text forwarded into an agent dispatch. */
export const MAX_DISPATCH_TEXT_CHARS = 2000;

export function truncateForDispatch(text: string, max = MAX_DISPATCH_TEXT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (truncated)`;
}

/**
 * Runs `task` but rejects if it takes longer than `ms`. The underlying work
 * is NOT cancelled (no AbortSignal is threaded through) — callers must treat
 * a timeout as "response budget exceeded", not as proof the work stopped.
 */
export function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer!));
}

export type ClaimedEngagementDispatch = {
  id: string;
  tenantId: string;
  platform: string;
  text: string;
  commenterName: string | null;
  commenterHandle: string | null;
  platformPostId: string | null;
};

function rowsOf(result: unknown): Record<string, unknown>[] {
  const rows = (result as { rows?: unknown }).rows ?? result;
  return (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Resets `dispatching` rows stranded by crashed/overlapping ticks. */
export async function recoverStaleEngagementDispatches(
  staleAfterMs = DISPATCH_STALE_AFTER_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const reset = await db
    .update(engagementItems)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(engagementItems.status, "dispatching"), lt(engagementItems.updatedAt, cutoff)))
    .returning({ id: engagementItems.id });
  return reset.length;
}

/**
 * Atomically claims up to `limit` pending engagement items that have no
 * active reply draft. Only one overlapping worker wins each row.
 */
export async function claimEngagementDispatches(
  limit = DISPATCH_BATCH_LIMIT,
): Promise<ClaimedEngagementDispatch[]> {
  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT ei.id
      FROM engagement_items AS ei
      LEFT JOIN reply_drafts AS rd
        ON rd.engagement_item_id = ei.id
        AND rd.status IN ('pending_review', 'approved', 'sent')
      WHERE ei.status = 'pending' AND rd.id IS NULL
      ORDER BY ei.created_at ASC, ei.id ASC
      LIMIT ${limit}
      FOR UPDATE OF ei SKIP LOCKED
    )
    UPDATE engagement_items AS ei
    SET status = 'dispatching', updated_at = now()
    FROM candidates AS c
    WHERE ei.id = c.id
    RETURNING
      ei.id AS id,
      ei.tenant_id AS "tenantId",
      ei.platform AS "platform",
      ei.text AS "text",
      ei.commenter_name AS "commenterName",
      ei.commenter_handle AS "commenterHandle",
      ei.platform_post_id AS "platformPostId"
  `);
  return rowsOf(result).map((row) => ({
    id: str(row.id),
    tenantId: str(row.tenantId),
    platform: str(row.platform),
    text: str(row.text),
    commenterName: strOrNull(row.commenterName),
    commenterHandle: strOrNull(row.commenterHandle),
    platformPostId: strOrNull(row.platformPostId),
  }));
}

/** Releases a claimed item back to `pending` (skip path: no owner/tenant). */
export async function releaseEngagementDispatch(id: string): Promise<void> {
  await db
    .update(engagementItems)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(engagementItems.id, id), eq(engagementItems.status, "dispatching")));
}

export type ClaimedWebhookDispatch = {
  id: string;
  tenantId: string;
  eventType: string;
  platform: string | null;
};

/** Resets `dispatching` webhook events stranded by crashed/overlapping ticks. */
export async function recoverStaleWebhookDispatches(
  staleAfterMs = DISPATCH_STALE_AFTER_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const reset = await db
    .update(webhookEvents)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(webhookEvents.status, "dispatching"), lt(webhookEvents.updatedAt, cutoff)))
    .returning({ id: webhookEvents.id });
  return reset.length;
}

/**
 * Atomically claims up to `limit` pending webhook events. Only one
 * overlapping worker wins each row.
 */
export async function claimWebhookDispatches(
  limit = DISPATCH_BATCH_LIMIT,
): Promise<ClaimedWebhookDispatch[]> {
  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT we.id
      FROM webhook_events AS we
      WHERE we.status = 'pending' AND we.tenant_id IS NOT NULL
      ORDER BY we.created_at ASC, we.id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE webhook_events AS we
    SET status = 'dispatching', updated_at = now()
    FROM candidates AS c
    WHERE we.id = c.id
    RETURNING
      we.id AS id,
      we.tenant_id AS "tenantId",
      we.event_type AS "eventType",
      we.platform AS "platform"
  `);
  return rowsOf(result).map((row) => ({
    id: str(row.id),
    tenantId: str(row.tenantId),
    eventType: str(row.eventType),
    platform: strOrNull(row.platform),
  }));
}
