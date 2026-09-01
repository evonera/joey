'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { themePages, themeSources, themeSlots, themeVisualTemplates, contentPackages } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

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
  status?: string;
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

    const recentPackages = await db.query.contentPackages.findMany({
      where: and(eq(contentPackages.themePageId, id), eq(contentPackages.tenantId, tenantId)),
      orderBy: [desc(contentPackages.createdAt)],
      limit: 10,
    });

    return {
      page,
      sources,
      slots,
      templates,
      recentPackages,
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

    const [page] = await db.insert(themePages).values({
      tenantId,
      name: data.name.trim(),
      niche: data.niche?.trim() || null,
      audience: data.audience?.trim() || null,
      voice: data.voice?.trim() || null,
      brandKit: data.brandKit || null,
      connectedAccounts: data.connectedAccounts || [],
      defaultRightsPolicy: data.defaultRightsPolicy || 'strict',
      status: 'draft',
    }).returning();

    return { page };
  } catch (error: any) {
    console.error("Failed to create theme page:", error);
    return { error: "Failed to create theme page" };
  }
}

export async function updateThemePage(id: string, data: UpdateThemePageInput) {
  try {
    const tenantId = await getActiveTenantId();

    const [updated] = await db.update(themePages)
      .set({
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.niche !== undefined ? { niche: data.niche?.trim() || null } : {}),
        ...(data.audience !== undefined ? { audience: data.audience?.trim() || null } : {}),
        ...(data.voice !== undefined ? { voice: data.voice?.trim() || null } : {}),
        ...(data.brandKit !== undefined ? { brandKit: data.brandKit } : {}),
        ...(data.connectedAccounts !== undefined ? { connectedAccounts: data.connectedAccounts } : {}),
        ...(data.defaultRightsPolicy !== undefined ? { defaultRightsPolicy: data.defaultRightsPolicy } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
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
    return { error: "Failed to update theme page" };
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
    const [updated] = await db.update(themePages)
      .set({
        status: 'active',
        recipeRevision: db.query ? undefined : undefined, // bump revision
        updatedAt: new Date(),
      })
      .where(and(eq(themePages.id, id), eq(themePages.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return { error: "Theme page not found" };
    }

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

    return { page: updated };
  } catch (error: any) {
    console.error("Failed to pause theme page:", error);
    return { error: "Failed to pause theme page" };
  }
}
