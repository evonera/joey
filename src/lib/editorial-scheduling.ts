import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { drafts, editorialPreferences, member, socialAccounts } from "@/lib/db/schema";
import { conflictsWithSlot, editorialPreferencesSchema, isEditorialWindow } from "./editorial-calendar";

export type SchedulingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function draftScheduleRevision(draft: typeof drafts.$inferSelect) {
  return createHash("sha256").update(JSON.stringify([draft.content, draft.variants, draft.selectedVariantId, draft.platformOptions, draft.status, draft.scheduledFor])).digest("hex");
}

/** All interactive scheduling writers lock the same tenant/account row. */
export async function lockSchedulingAccount(tx: SchedulingTransaction, tenantId: string, accountId: string) {
  const [account] = await tx.select().from(socialAccounts).where(and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.id, accountId), eq(socialAccounts.isActive, true))).for("update");
  if (!account) throw new Error("The target account is disconnected or unavailable.");
  return account;
}

export async function assertSchedulingRole(tx: SchedulingTransaction, tenantId: string, userId: string) {
  const [membership] = await tx.select().from(member).where(and(eq(member.organizationId, tenantId), eq(member.userId, userId))).for("share");
  if (!membership || !["owner", "admin"].includes(membership.role)) throw new Error("Only current workspace owners/admins may confirm schedules.");
}

/** Includes pending proposals conservatively, unreconciled publishing work,
 * published history, and Theme packages bound to this exact account. */
export async function occupiedAccountTimes(tx: SchedulingTransaction, tenantId: string, accountId: string, start: Date, end: Date, excludeDraftId = "") {
  const result = await tx.execute(sql`
    SELECT "time" FROM (
      SELECT scheduled_for AS "time" FROM drafts WHERE tenant_id = ${tenantId}
        AND platform_options->>'accountId' = ${accountId} AND id <> ${excludeDraftId}
        AND status IN ('draft','pending_review','approved','scheduled','publishing','failed')
      UNION ALL
      SELECT p.published_at AS "time" FROM posts p JOIN drafts d ON d.id = p.draft_id AND d.tenant_id = p.tenant_id
        WHERE p.tenant_id = ${tenantId} AND p.status = 'published' AND d.platform_options->>'accountId' = ${accountId}
      UNION ALL
      SELECT COALESCE(c.published_at,c.scheduled_for) AS "time" FROM content_packages c
        JOIN theme_pages t ON t.id = c.theme_page_id AND t.tenant_id = c.tenant_id
        WHERE c.tenant_id = ${tenantId} AND t.connected_accounts @> ${JSON.stringify([accountId])}::jsonb
        AND c.status IN ('pending_review','approved','publishing','published','failed')
    ) times WHERE "time" BETWEEN ${start.toISOString()}::timestamp AND ${end.toISOString()}::timestamp LIMIT 5001`);
  const rows = (Array.isArray(result) ? result : (result as unknown as { rows: { time: string | Date }[] }).rows) as { time: string | Date }[];
  if (rows.length > 5000) throw new Error("This account has too many calendar entries for safe suggestions. Narrow the schedule first.");
  return rows.map(row => new Date(row.time));
}

export async function assertAvailableSchedule(tx: SchedulingTransaction, tenantId: string, accountId: string, candidate: Date, excludeDraftId?: string) {
  const stored = await tx.query.editorialPreferences.findFirst({ where: and(eq(editorialPreferences.tenantId, tenantId), eq(editorialPreferences.accountId, accountId)) });
  // Preferences govern cadence only when explicitly saved. Existing users are
  // not silently enrolled into a new six-hour scheduling restriction.
  const spacing = stored ? editorialPreferencesSchema.parse(stored.preferences).spacingMinutes : 1;
  const occupied = await occupiedAccountTimes(tx, tenantId, accountId, new Date(candidate.getTime() - spacing * 60_000), new Date(candidate.getTime() + spacing * 60_000), excludeDraftId);
  if (conflictsWithSlot(candidate, occupied, spacing)) throw new Error("This account already has a nearby post. Refresh suggestions or choose another time.");
}

export async function scheduleApprovedDraft(tx: SchedulingTransaction, tenantId: string, userId: string, draftId: string, revision: string, candidate: Date) {
  const before = await tx.query.drafts.findFirst({ where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)) });
  const accountId = (before?.platformOptions as { accountId?: string } | null)?.accountId;
  if (!before || !accountId) throw new Error("Choose an account-targeted draft.");
  await lockSchedulingAccount(tx, tenantId, accountId);
  await assertSchedulingRole(tx, tenantId, userId);
  const [current] = await tx.select().from(drafts).where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId))).for("update");
  if (!current || draftScheduleRevision(current) !== revision) throw new Error("The draft changed. Review it and refresh suggestions.");
  if (!["approved", "scheduled"].includes(current.status) || current.errorMessage?.startsWith("verify:")) throw new Error("Approve this draft before confirming its publication schedule.");
  const options = current.platformOptions as { renderJobId?: string; renderStatus?: string } | null;
  if (options?.renderJobId && options.renderStatus !== "succeeded") throw new Error("Wait for the finished media before scheduling.");
  const stored = await tx.query.editorialPreferences.findFirst({ where: and(eq(editorialPreferences.tenantId, tenantId), eq(editorialPreferences.accountId, accountId)) });
  if (!stored || !isEditorialWindow(editorialPreferencesSchema.parse(stored.preferences), candidate) || candidate.getTime() % (15 * 60_000) !== 0) throw new Error("The posting windows changed or this is not a suggested slot. Refresh suggestions.");
  await assertAvailableSchedule(tx, tenantId, accountId, candidate, draftId);
  await tx.update(drafts).set({ scheduledFor: candidate, status: "scheduled" }).where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId), inArray(drafts.status, ["approved", "scheduled"])));
}
