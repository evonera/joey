"use server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getActiveTenantMembership } from "@/lib/auth";
import { db } from "@/lib/db";
import { drafts, editorialPreferences, socialAccounts } from "@/lib/db/schema";
import { editorialPreferencesSchema, suggestEditorialSlots } from "@/lib/editorial-calendar";
import { assertSchedulingRole, draftScheduleRevision, lockSchedulingAccount, occupiedAccountTimes, scheduleApprovedDraft, singleSchedulingAccount } from "@/lib/editorial-scheduling";

function enabled() { if (process.env.EDITORIAL_SCHEDULING_ENABLED !== "true") throw new Error("Assisted scheduling is not enabled in this environment."); }
function message(error: unknown) { return error instanceof Error ? error.message : "Unable to update the editorial schedule."; }

export async function canUseEditorialScheduling() {
  const { role } = await getActiveTenantMembership();
  return process.env.EDITORIAL_SCHEDULING_ENABLED === "true" && ["owner", "admin"].includes(role);
}

export async function getEditorialSetup() {
  const { tenantId, role } = await getActiveTenantMembership();
  if (process.env.EDITORIAL_SCHEDULING_ENABLED !== "true" || !["owner", "admin"].includes(role)) return { enabled: false as const, accounts: [], preferences: [] };
  const [accounts, preferences] = await Promise.all([
    db.query.socialAccounts.findMany({ where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true)), columns: { id: true, platform: true, accountName: true } }),
    db.query.editorialPreferences.findMany({ where: eq(editorialPreferences.tenantId, tenantId) }),
  ]);
  return { enabled: true as const, accounts, preferences: preferences.map(row => ({ accountId: row.accountId, ...editorialPreferencesSchema.parse(row.preferences) })) };
}

export async function saveEditorialPreferences(accountId: string, input: unknown) {
  try {
    enabled(); z.uuid().parse(accountId);
    const preferences = editorialPreferencesSchema.parse(input);
    const { tenantId, userId } = await getActiveTenantMembership(["owner", "admin"]);
    await db.transaction(async tx => {
      await lockSchedulingAccount(tx, tenantId, accountId);
      await assertSchedulingRole(tx, tenantId, userId);
      await tx.insert(editorialPreferences).values({ tenantId, accountId, preferences }).onConflictDoUpdate({ target: [editorialPreferences.tenantId, editorialPreferences.accountId], set: { preferences, updatedAt: new Date() } });
    });
    revalidatePath("/calendar"); return { success: true as const };
  } catch (error) { return { error: message(error) }; }
}

export async function getDraftSlotSuggestions(draftId: string) {
  try {
    enabled(); z.uuid().parse(draftId);
    const { tenantId } = await getActiveTenantMembership(["owner", "admin"]);
    return await db.transaction(async tx => {
      const draft = await tx.query.drafts.findFirst({ where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)) });
      const accountId = singleSchedulingAccount(draft?.platformOptions);
      if (!draft || !accountId) throw new Error("Choose an account-targeted draft.");
      const account = await lockSchedulingAccount(tx, tenantId, accountId);
      const stored = await tx.query.editorialPreferences.findFirst({ where: and(eq(editorialPreferences.tenantId, tenantId), eq(editorialPreferences.accountId, accountId)) });
      if (!stored) throw new Error("Save this account’s timezone and posting windows in Calendar first.");
      const prefs = editorialPreferencesSchema.parse(stored.preferences);
      const now = new Date();
      const occupied = await occupiedAccountTimes(tx, tenantId, accountId, new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 15 * 86_400_000), draftId);
      return { accountId, accountName: account.accountName, revision: draftScheduleRevision(draft), suggestions: suggestEditorialSlots(prefs, occupied, now) };
    });
  } catch (error) { return { error: message(error) }; }
}

export async function confirmEditorialSlot(input: unknown) {
  try {
    enabled();
    const parsed = z.object({ draftId: z.uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/), utc: z.iso.datetime() }).strict().parse(input);
    const date = new Date(parsed.utc); const now = new Date();
    if (date <= now || date.getTime() > now.getTime() + 14 * 86_400_000) throw new Error("Choose a future time within fourteen days.");
    const { tenantId, userId } = await getActiveTenantMembership(["owner", "admin"]);
    await db.transaction(tx => scheduleApprovedDraft(tx, tenantId, userId, parsed.draftId, parsed.revision, date));
    revalidatePath("/calendar"); revalidatePath("/drafts"); return { success: true as const };
  } catch (error) { return { error: message(error) }; }
}
