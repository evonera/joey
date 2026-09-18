'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { scouts, scoutRuns } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { evaluateScout } from "@/lib/scouts/evaluator";
import { revalidatePath } from "next/cache";

export interface CreateScoutInput {
  name: string;
  targetUrl: string;
  platform?: "instagram" | "tiktok" | "twitter" | "youtube" | "web";
  goalCondition: string;
  pollIntervalMinutes?: number;
}

export async function getScouts() {
  const tenantId = await getActiveTenantId();
  return db.query.scouts.findMany({
    where: eq(scouts.tenantId, tenantId),
    orderBy: [desc(scouts.createdAt)],
  });
}

export async function getScoutById(scoutId: string) {
  const tenantId = await getActiveTenantId();
  return db.query.scouts.findFirst({
    where: and(eq(scouts.id, scoutId), eq(scouts.tenantId, tenantId)),
  });
}

export async function getScoutRuns(scoutId: string) {
  const tenantId = await getActiveTenantId();
  return db.query.scoutRuns.findMany({
    where: and(eq(scoutRuns.scoutId, scoutId), eq(scoutRuns.tenantId, tenantId)),
    orderBy: [desc(scoutRuns.createdAt)],
    limit: 20,
  });
}

export async function createScout(input: CreateScoutInput) {
  const tenantId = await getActiveTenantId();

  if (!input.name?.trim()) throw new Error("Scout name is required");
  if (!input.targetUrl?.trim()) throw new Error("Target URL is required");
  if (!input.goalCondition?.trim()) throw new Error("Goal condition is required");

  const [created] = await db
    .insert(scouts)
    .values({
      tenantId,
      name: input.name.trim(),
      targetUrl: input.targetUrl.trim(),
      platform: input.platform || "instagram",
      goalCondition: input.goalCondition.trim(),
      pollIntervalMinutes: input.pollIntervalMinutes || 120,
    })
    .returning();

  revalidatePath("/scouts");
  return created;
}

export async function runScoutNow(scoutId: string) {
  const tenantId = await getActiveTenantId();
  const scout = await db.query.scouts.findFirst({
    where: and(eq(scouts.id, scoutId), eq(scouts.tenantId, tenantId)),
  });
  if (!scout) throw new Error("Scout not found.");

  const result = await evaluateScout(scoutId, { tenantId, force: true });
  revalidatePath("/scouts");
  return result;
}

export async function toggleScout(scoutId: string, isActive: boolean) {
  const tenantId = await getActiveTenantId();
  await db
    .update(scouts)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(scouts.id, scoutId), eq(scouts.tenantId, tenantId)));

  revalidatePath("/scouts");
  return { success: true };
}

export async function deleteScout(scoutId: string) {
  const tenantId = await getActiveTenantId();
  await db
    .delete(scouts)
    .where(and(eq(scouts.id, scoutId), eq(scouts.tenantId, tenantId)));

  revalidatePath("/scouts");
  return { success: true };
}

export async function remixScoutAlertAction(input: { scoutId: string; themePageId?: string }) {
  const tenantId = await getActiveTenantId();
  const { remixScoutAlertToThemeStudio } = await import("@/lib/scouts/remix-pipeline");
  const result = await remixScoutAlertToThemeStudio({
    tenantId,
    scoutId: input.scoutId,
    themePageId: input.themePageId,
  });

  revalidatePath("/scouts");
  revalidatePath("/drafts");
  return result;
}

