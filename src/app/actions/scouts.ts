'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { scouts, scoutRuns } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { evaluateScout } from "@/lib/scouts/evaluator";
import { revalidatePath } from "next/cache";
import { resolveToken } from "@/lib/flows/nodes/data/apify-actor";

export interface CreateScoutInput {
  name: string;
  targetUrl: string;
  platform?: "instagram" | "tiktok" | "twitter" | "youtube" | "web";
  goalCondition: string;
  pollIntervalMinutes?: number;
}

function validateScoutInput(input: CreateScoutInput) {
  if (!input.name?.trim()) throw new Error("Scout name is required");
  if (!input.targetUrl?.trim()) throw new Error("Target URL is required");
  if (!input.goalCondition?.trim()) throw new Error("Goal condition is required");
  if (input.name.length > 120 || input.goalCondition.length > 1000) throw new Error("Scout name or goal is too long.");
  const platform = input.platform || "instagram";
  if (!["instagram", "tiktok", "twitter", "youtube", "web"].includes(platform)) throw new Error("Unsupported Scout platform.");
  let url: URL;
  try { url = new URL(input.targetUrl.trim()); } catch { throw new Error("Enter a full HTTPS target URL."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Enter a public HTTPS target URL without credentials.");
  const expectedHosts: Record<string, string[]> = {
    instagram: ["instagram.com"], tiktok: ["tiktok.com"], twitter: ["x.com", "twitter.com"], youtube: ["youtube.com", "youtu.be"], web: [],
  };
  if (expectedHosts[platform].length && !expectedHosts[platform].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error(`Use a ${platform} URL for this platform.`);
  }
  return { name: input.name.trim(), targetUrl: url.toString(), platform, goalCondition: input.goalCondition.trim(), pollIntervalMinutes: 1440 };
}

export async function getScoutSetup() {
  const tenantId = await getActiveTenantId();
  try { await resolveToken(tenantId); return { apifyReady: true }; }
  catch { return { apifyReady: false, issue: "Connect an Apify token in Settings before automatic monitoring can run." }; }
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
  const values = validateScoutInput(input);
  const setup = await getScoutSetup();

  const [created] = await db
    .insert(scouts)
    .values({
      tenantId,
      ...values,
      isActive: setup.apifyReady,
    })
    .returning();

  revalidatePath("/scouts");
  return created;
}

export async function updateScout(scoutId: string, input: CreateScoutInput) {
  const tenantId = await getActiveTenantId();
  const values = validateScoutInput(input);
  const existing = await db.query.scouts.findFirst({ where: and(eq(scouts.id, scoutId), eq(scouts.tenantId, tenantId)) });
  if (!existing) throw new Error("Scout not found.");
  const changedTarget = existing.targetUrl !== values.targetUrl || existing.goalCondition !== values.goalCondition || existing.platform !== values.platform;
  const [updated] = await db.update(scouts).set({
    ...values,
    ...(changedTarget ? { latestAlert: null, lastPolledAt: null } : {}),
    updatedAt: new Date(),
  }).where(and(eq(scouts.id, scoutId), eq(scouts.tenantId, tenantId))).returning();
  revalidatePath("/scouts");
  return updated;
}

export async function runScoutNow(scoutId: string) {
  const tenantId = await getActiveTenantId();
  const scout = await db.query.scouts.findFirst({
    where: and(eq(scouts.id, scoutId), eq(scouts.tenantId, tenantId)),
  });
  if (!scout) throw new Error("Scout not found.");

  // A missing token is a setup problem, not a failed scan. Avoid creating a
  // misleading failed run that the user could never have completed.
  await resolveToken(tenantId);

  const result = await evaluateScout(scoutId, { tenantId, force: true });
  revalidatePath("/scouts");
  return result;
}

export async function toggleScout(scoutId: string, isActive: boolean) {
  const tenantId = await getActiveTenantId();
  if (isActive) await resolveToken(tenantId);
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
