'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { themePages, themeSources, themeSlots, themeVisualTemplates, themeContentFormats, contentPackages, flows, socialAccounts } from "@/lib/db/schema";
import { eq, and, desc, like, inArray, sql } from "drizzle-orm";
import { syncThemePageFlow } from "@/lib/flows/recipe-compiler";
import { assertThemePageQuota } from "@/lib/billing";

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
    primaryColor: color("primaryColor", "#0f172a"),
    accentColor: color("accentColor", "#38bdf8"),
    watermark: normalizeText(typeof value.watermark === "string" ? value.watermark : undefined, 80),
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

    const sources = await db.query.themeSources.findMany({
      where: and(eq(themeSources.themePageId, id), eq(themeSources.tenantId, tenantId)),
    });

    const slots = await db.query.themeSlots.findMany({
      where: and(eq(themeSlots.themePageId, id), eq(themeSlots.tenantId, tenantId)),
      orderBy: [themeSlots.priority],
    });

    const templates = await db.query.themeVisualTemplates.findMany({
      where: and(eq(themeVisualTemplates.themePageId, id), eq(themeVisualTemplates.tenantId, tenantId)),
    });

    const formats = await db.query.themeContentFormats.findMany({
      where: eq(themeContentFormats.tenantId, tenantId),
      columns: { id: true, platform: true },
    });

    const recentPackages = await db.query.contentPackages.findMany({
      where: and(eq(contentPackages.themePageId, id), eq(contentPackages.tenantId, tenantId)),
      orderBy: [desc(contentPackages.createdAt)],
      limit: 10,
    });
    const selectedAccountIds = Array.isArray(page.connectedAccounts)
      ? page.connectedAccounts.filter((accountId): accountId is string => typeof accountId === "string")
      : [];
    const publishingAccounts = selectedAccountIds.length > 0
      ? await db.query.socialAccounts.findMany({
          where: and(
            eq(socialAccounts.tenantId, tenantId),
            eq(socialAccounts.isActive, true),
            inArray(socialAccounts.id, selectedAccountIds),
          ),
          columns: { id: true, platform: true },
        })
      : [];

    return {
      page,
      sources,
      slots,
      templates,
      formats,
      recentPackages,
      publishingAccounts,
    };
  } catch (error: any) {
    console.error("Failed to fetch theme page details:", error);
    return { error: "Failed to fetch theme page details" };
  }
}

export async function createThemePage(data: CreateThemePageInput) {
  try {
    const tenantId = await getActiveTenantId();

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
    const isNeonHttp = process.env.DATABASE_PROVIDER === 'neon-http';

    let page: typeof themePages.$inferSelect;

    if (isNeonHttp) {
      // neon-http driver has no transaction support. Use an atomic conditional
      // INSERT...SELECT WHERE count < limit to prevent concurrent over-creation.
      const { checkUsageLimits } = await import("@/lib/billing");
      const limits = await checkUsageLimits(tenantId);
      const limit = limits.themePageLimit;
      const result = await db.execute(sql`
        INSERT INTO theme_pages (
          id, tenant_id, name, niche, audience, voice,
          brand_kit, connected_accounts, default_rights_policy, status
        )
        SELECT
          ${id}, ${tenantId}, ${name},
          ${normalizeText(data.niche, 240)},
          ${normalizeText(data.audience, 500)},
          ${normalizeText(data.voice, 2_000)},
          ${JSON.stringify(sanitizeBrandKit(data.brandKit))}::jsonb,
          ${JSON.stringify(connectedAccounts)}::jsonb,
          ${data.defaultRightsPolicy || 'strict'}, 'draft'
        WHERE (
          SELECT count(*) FROM theme_pages WHERE tenant_id = ${tenantId}
        ) < ${limit}
        RETURNING *
      `);
      const inserted = (result as any).rows?.[0] ?? (result as any)[0];
      if (!inserted) {
        throw new Error("Free workspace limit reached (1 Theme Page). Upgrade to Pro for unlimited theme pages.");
      }
      page = inserted;
    } else {
      // postgres-js and neon-serverless Pool: use advisory lock inside a
      // transaction so the count check and insert are fully serialized.
      page = await db.transaction(async (tx) => {
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
    }

    return { page };
  } catch (error: any) {
    console.error("Failed to create theme page:", error);
    return { error: safeMutationError(error, "Failed to create theme page") };
  }
}

export async function updateThemePage(id: string, data: UpdateThemePageInput) {
  try {
    const tenantId = await getActiveTenantId();
    if (data.defaultRightsPolicy !== undefined && !["strict", "moderate", "permissive"].includes(data.defaultRightsPolicy)) {
      return { error: "Invalid rights policy" };
    }
    if (data.connectedAccounts !== undefined) {
      data = { ...data, connectedAccounts: await validateConnectedAccounts(tenantId, data.connectedAccounts) };
    }
    if (data.name !== undefined && (!data.name.trim() || data.name.trim().length > 120)) {
      return { error: "Page name must contain 1-120 characters" };
    }

    const [updated] = await db.update(themePages)
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
    const tenantId = await getActiveTenantId();
    await db.delete(themePages)
      .where(and(eq(themePages.id, id), eq(themePages.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete theme page:", error);
    return { error: "Failed to delete theme page" };
  }
}

export async function activateThemePage(id: string) {
  try {
    const tenantId = await getActiveTenantId();
    const compilation = await syncThemePageFlow(tenantId, id);
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
    const tenantId = await getActiveTenantId();
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
