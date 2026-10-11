'use server';

import { invalidateThemeMedia } from "@/lib/media-engine/invalidation";
import { getActiveTenantId, getActiveTenantMembership, requireRole } from "@/lib/auth";
import { detachAgencyResource } from "@/lib/agency/service";
import { db } from "@/lib/db";
import { themePages, themeSources, themeSlots, themeVisualTemplates, themeContentFormats, contentPackages, flows, socialAccounts } from "@/lib/db/schema";
import { eq, and, desc, like, inArray, sql } from "drizzle-orm";
import { syncThemePageFlow } from "@/lib/flows/recipe-compiler";
import { themeRecipeMode, themeRecipeModeSchema, type ThemeRecipeMode } from "@/lib/flows/theme-recipe-mode";
import type { FlowGraphDoc } from "@/lib/flows/types";
import { assertThemePageQuota } from "@/lib/billing";
import { createThemeSource, type CreateThemeSourceInput } from "./theme-sources";
import { createThemeSlot, type CreateThemeSlotInput } from "./theme-slots";
import { createThemeTemplate, type CreateThemeTemplateInput } from "./theme-templates";

export interface CreateThemePageInput {
  name: string;
  niche?: string;
  audience?: string;
  voice?: string;
  brandKit?: Record<string, unknown>;
  connectedAccounts?: string[];
  defaultRightsPolicy?: string;
}

export interface UpdateThemePageInput {
  name?: string;
  niche?: string;
  audience?: string;
  voice?: string;
  brandKit?: Record<string, unknown>;
  connectedAccounts?: string[];
  defaultRightsPolicy?: string;
}

export interface CreateThemePageFromWizardInput {
  page: CreateThemePageInput;
  sources: Array<Omit<CreateThemeSourceInput, "themePageId">>;
  slots: Array<Omit<CreateThemeSlotInput, "themePageId">>;
  template?: Omit<CreateThemeTemplateInput, "themePageId">;
}

function normalizeText(value: string | undefined, maxLength: number): string | null {
  const normalized = value?.trim() || "";
  if (normalized.length > maxLength) throw new Error(`Text must be ${maxLength} characters or fewer`);
  return normalized || null;
}

function sanitizeBrandKit(value: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!value) return null;
  const color = (key: string, fallback: string) => {
    const candidate = value[key];
    return typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
  };
  return {
    ...value,
    primaryColor: color("primaryColor", "#0a0908"),
    accentColor: color("accentColor", "#ffe633"),
    watermark: normalizeText(typeof value.watermark === "string" ? value.watermark : undefined, 80),
    brandInitial: typeof value.brandInitial === "string" ? value.brandInitial.slice(0, 5) : "🅟",
    topBadge: typeof value.topBadge === "string" ? value.topBadge : "yellow_logo",
    showDivider: typeof value.showDivider === "boolean" ? value.showDivider : true,
  };
}

async function validateConnectedAccounts(tenantId: string, accountIds: string[] | undefined): Promise<string[]> {
  const uniqueIds = [...new Set(accountIds || [])];
  const ownedAccounts = uniqueIds.length === 0 ? [] : await db.query.socialAccounts.findMany({
    where: and(eq(socialAccounts.tenantId, tenantId), inArray(socialAccounts.id, uniqueIds)),
    columns: { id: true },
  });
  if (ownedAccounts.length !== uniqueIds.length) throw new Error("One or more publishing accounts are unavailable");
  return uniqueIds;
}

function safeMutationError(error: unknown, fallback: string): string {
  if (error instanceof Error && (
    /^Text must be \d+ characters or fewer$/.test(error.message)
    || error.message === "One or more publishing accounts are unavailable"
    || error.message.includes("Free workspace limit reached")
    || error.message.includes("Upgrade to Pro")
  )) return error.message;
  return fallback;
}

export async function getThemePages() {
  try {
    const tenantId = await getActiveTenantId();
    const pages = await db.query.themePages.findMany({
      where: eq(themePages.tenantId, tenantId),
      orderBy: [desc(themePages.updatedAt)],
    });
    return { pages };
  } catch (error: any) {
    console.error("Failed to fetch theme pages:", error);
    return { error: "Failed to fetch theme pages" };
  }
}

export async function getThemePageById(id: string) {
  try {
    const tenantId = await getActiveTenantId();
    const page = await db.query.themePages.findFirst({
      where: and(eq(themePages.id, id), eq(themePages.tenantId, tenantId)),
    });

    if (!page) {
      return { error: "Theme page not found" };
    }

    const selectedAccountIds = Array.isArray(page.connectedAccounts)
      ? page.connectedAccounts.filter((accountId): accountId is string => typeof accountId === "string")
      : [];
    const [sources, slots, templates, formats, recentPackages, publishingAccounts, recipeFlow] = await Promise.all([
      db.query.themeSources.findMany({
        where: and(eq(themeSources.themePageId, id), eq(themeSources.tenantId, tenantId)),
      }),
      db.query.themeSlots.findMany({
        where: and(eq(themeSlots.themePageId, id), eq(themeSlots.tenantId, tenantId)),
        orderBy: [themeSlots.priority],
      }),
      db.query.themeVisualTemplates.findMany({
        where: and(eq(themeVisualTemplates.themePageId, id), eq(themeVisualTemplates.tenantId, tenantId)),
      }),
      db.query.themeContentFormats.findMany({ where: eq(themeContentFormats.tenantId, tenantId) }),
      db.query.contentPackages.findMany({
        where: and(eq(contentPackages.themePageId, id), eq(contentPackages.tenantId, tenantId)),
        orderBy: [desc(contentPackages.createdAt)],
        limit: 10,
      }),
      selectedAccountIds.length ? db.query.socialAccounts.findMany({
        where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true), inArray(socialAccounts.id, selectedAccountIds)),
        columns: { id: true, platform: true },
      }) : Promise.resolve([]),
      db.query.flows.findFirst({
        where: and(eq(flows.tenantId, tenantId), like(flows.description, `[Theme Studio:${id}]%`)),
        columns: { graph: true },
      }),
    ]);
    const formatMap = new Map(formats.map(f => [f.id, f]));
    const populatedSlots = slots.map(slot => ({ ...slot, format: formatMap.get(slot.formatId) || null }));

    return {
      page,
      sources,
      slots: populatedSlots,
      templates,
      formats,
      recentPackages,
      publishingAccounts,
      executionMode: recipeFlow ? themeRecipeMode(recipeFlow.graph as FlowGraphDoc) : "draft_only" as ThemeRecipeMode,
    };
  } catch (error: any) {
    console.error("Failed to fetch theme page details:", error);
    return { error: "Failed to fetch theme page details" };
  }
}

export async function createThemePage(data: CreateThemePageInput) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);

    if (!data.name || !data.name.trim()) {
      return { error: "Page name is required" };
    }
    const name = data.name.trim();
    if (name.length > 120) return { error: "Page name must be 120 characters or fewer" };
    if (data.defaultRightsPolicy && !["strict", "moderate", "permissive"].includes(data.defaultRightsPolicy)) {
      return { error: "Invalid rights policy" };
    }
    const connectedAccounts = await validateConnectedAccounts(tenantId, data.connectedAccounts);

    const id = crypto.randomUUID();
    // Theme-page quotas depend on the tenant lock and insert sharing one transaction.
    const page = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`);
        await assertThemePageQuota(tenantId, tx);
        const [inserted] = await tx
          .insert(themePages)
          .values({
            id,
            tenantId,
            name,
            niche: normalizeText(data.niche, 240),
            audience: normalizeText(data.audience, 500),
            voice: normalizeText(data.voice, 2_000),
            brandKit: sanitizeBrandKit(data.brandKit),
            connectedAccounts,
            defaultRightsPolicy: data.defaultRightsPolicy || 'strict',
            status: 'draft',
          })
          .returning();
        return inserted;
      });

    return { page };
  } catch (error: any) {
    console.error("Failed to create theme page:", error);
    return { error: safeMutationError(error, "Failed to create theme page") };
  }
}

/**
 * Complete the five-step wizard in one browser-to-server round trip. The
 * existing mutation actions remain the validation boundary; independent
 * source/slot/template writes run concurrently after the page exists. Any
 * partial setup is removed, including templates whose foreign key uses SET NULL.
 */
export async function createThemePageFromWizard(data: CreateThemePageFromWizardInput) {
  const pageResult = await createThemePage(data.page);
  if (!pageResult.page) return { error: pageResult.error || "Failed to create theme page" };

  const page = pageResult.page;
  try {
    const templatesByFormat = new Map<string, string>();
    if (data.template) {
      for (const formatId of new Set(data.slots.map((slot) => slot.formatId))) {
        const result = await createThemeTemplate({
          ...data.template,
          name: formatId === data.template.formatId ? data.template.name : `${data.template.name} (${formatId})`,
          formatId,
          themePageId: page.id,
        });
        if (!result.template) throw new Error(result.error || "Failed to create visual template");
        templatesByFormat.set(formatId, result.template.id);
      }
    }
    const results = await Promise.all([
      ...data.sources.map((source) => createThemeSource({ ...source, themePageId: page.id })),
      ...data.slots.map((slot) => createThemeSlot({
        ...slot,
        themePageId: page.id,
        overrideTemplateId: slot.overrideTemplateId || templatesByFormat.get(slot.formatId),
      })),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(failed.error);
    return { page };
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx.delete(themeVisualTemplates).where(and(eq(themeVisualTemplates.themePageId, page.id), eq(themeVisualTemplates.tenantId, page.tenantId)));
      await tx.delete(themePages).where(and(eq(themePages.id, page.id), eq(themePages.tenantId, page.tenantId)));
    });
    console.error("Failed to complete theme page wizard:", error);
    return { error: error instanceof Error ? error.message : "Failed to complete theme page setup" };
  }
}

export async function updateThemePage(id: string, data: UpdateThemePageInput) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    if (data.defaultRightsPolicy !== undefined && !["strict", "moderate", "permissive"].includes(data.defaultRightsPolicy)) {
      return { error: "Invalid rights policy" };
    }
    if (data.connectedAccounts !== undefined) {
      data = { ...data, connectedAccounts: await validateConnectedAccounts(tenantId, data.connectedAccounts) };
    }
    if (data.name !== undefined && (!data.name.trim() || data.name.trim().length > 120)) {
      return { error: "Page name must contain 1-120 characters" };
    }

    const updated = await db.transaction(async tx => {
    const [row] = await tx.update(themePages)
      .set({
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.niche !== undefined ? { niche: normalizeText(data.niche, 240) } : {}),
        ...(data.audience !== undefined ? { audience: normalizeText(data.audience, 500) } : {}),
        ...(data.voice !== undefined ? { voice: normalizeText(data.voice, 2_000) } : {}),
        ...(data.brandKit !== undefined ? { brandKit: sanitizeBrandKit(data.brandKit) } : {}),
        ...(data.connectedAccounts !== undefined ? { connectedAccounts: data.connectedAccounts } : {}),
        ...(data.defaultRightsPolicy !== undefined ? { defaultRightsPolicy: data.defaultRightsPolicy } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(themePages.id, id), eq(themePages.tenantId, tenantId)))
      .returning();
      if (row) await invalidateThemeMedia(tx, tenantId, { kind: "page", id }, data.name !== undefined || data.brandKit !== undefined);
      return row;
    });

    if (!updated) {
      return { error: "Theme page not found" };
    }

    return { page: updated };
  } catch (error: any) {
    console.error("Failed to update theme page:", error);
    return { error: safeMutationError(error, "Failed to update theme page") };
  }
}

export async function deleteThemePage(id: string) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    const { userId } = await getActiveTenantMembership();
    await db.transaction(async tx => {
      await detachAgencyResource(tx, { tenantId, userId }, { kind: "page", id });
      await tx.delete(themePages).where(and(eq(themePages.id, id), eq(themePages.tenantId, tenantId)));
    });

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete theme page:", error);
    return { error: "Failed to delete theme page" };
  }
}

export async function activateThemePage(id: string, mode: ThemeRecipeMode = "publishing") {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    const parsedMode = themeRecipeModeSchema.safeParse(mode);
    if (!parsedMode.success) return { error: "Choose draft-only or publishing mode." };
    const compilation = await syncThemePageFlow(tenantId, id, parsedMode.data);
    if (!compilation.compiled.isValid) {
      return { error: `Theme recipe is invalid: ${compilation.compiled.validationIssues.join("; ")}` };
    }
    if (!compilation.flow) {
      return { error: "Theme recipe could not be compiled" };
    }

    const [updated] = await db.update(themePages)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(themePages.id, id), eq(themePages.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return { error: "Theme page not found" };
    }

    await db.update(flows)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(flows.id, compilation.flow.id), eq(flows.tenantId, tenantId)));

    return { page: updated };
  } catch (error: any) {
    console.error("Failed to activate theme page:", error);
    return { error: "Failed to activate theme page" };
  }
}

export async function pauseThemePage(id: string) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    const [updated] = await db.update(themePages)
      .set({
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(and(eq(themePages.id, id), eq(themePages.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return { error: "Theme page not found" };
    }

    await db.update(flows)
      .set({ status: "paused", updatedAt: new Date() })
      .where(and(
        eq(flows.tenantId, tenantId),
        like(flows.description, `[Theme Studio:${id}]%`),
      ));

    return { page: updated };
  } catch (error: any) {
    console.error("Failed to pause theme page:", error);
    return { error: "Failed to pause theme page" };
  }
}
