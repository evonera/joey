'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { themeSources, themePages } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export interface CreateThemeSourceInput {
  themePageId: string;
  name: string;
  sourceType: 'rss' | 'http' | 'reddit' | 'api';
  url: string;
  pollIntervalMinutes?: number;
  freshnessWindowHours?: number;
  geoFilter?: string;
  langFilter?: string;
  rightsCategory?: string;
}

export interface UpdateThemeSourceInput {
  name?: string;
  sourceType?: 'rss' | 'http' | 'reddit' | 'api';
  url?: string;
  pollIntervalMinutes?: number;
  freshnessWindowHours?: number;
  geoFilter?: string;
  langFilter?: string;
  rightsCategory?: string;
  isActive?: boolean;
}

export async function getThemeSources(themePageId: string) {
  try {
    const tenantId = await getActiveTenantId();
    const sources = await db.query.themeSources.findMany({
      where: and(eq(themeSources.themePageId, themePageId), eq(themeSources.tenantId, tenantId)),
      orderBy: [desc(themeSources.createdAt)],
    });
    return { sources };
  } catch (error: any) {
    console.error("Failed to fetch theme sources:", error);
    return { error: "Failed to fetch theme sources" };
  }
}

export async function createThemeSource(data: CreateThemeSourceInput) {
  try {
    const tenantId = await getActiveTenantId();

    if (!data.name || !data.name.trim()) {
      return { error: "Source name is required" };
    }
    if (!data.url || !data.url.trim()) {
      return { error: "Source URL is required" };
    }

    // Verify page belongs to tenant
    const page = await db.query.themePages.findFirst({
      where: and(eq(themePages.id, data.themePageId), eq(themePages.tenantId, tenantId)),
    });
    if (!page) {
      return { error: "Theme page not found" };
    }

    const [source] = await db.insert(themeSources).values({
      tenantId,
      themePageId: data.themePageId,
      name: data.name.trim(),
      sourceType: data.sourceType,
      url: data.url.trim(),
      pollIntervalMinutes: data.pollIntervalMinutes ?? 60,
      freshnessWindowHours: data.freshnessWindowHours ?? 24,
      geoFilter: data.geoFilter?.trim() || null,
      langFilter: data.langFilter?.trim() || null,
      rightsCategory: data.rightsCategory || 'unknown',
      isActive: true,
    }).returning();

    return { source };
  } catch (error: any) {
    console.error("Failed to create theme source:", error);
    return { error: "Failed to create theme source" };
  }
}

export async function updateThemeSource(id: string, data: UpdateThemeSourceInput) {
  try {
    const tenantId = await getActiveTenantId();

    const [updated] = await db.update(themeSources)
      .set({
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.sourceType !== undefined ? { sourceType: data.sourceType } : {}),
        ...(data.url !== undefined ? { url: data.url.trim() } : {}),
        ...(data.pollIntervalMinutes !== undefined ? { pollIntervalMinutes: data.pollIntervalMinutes } : {}),
        ...(data.freshnessWindowHours !== undefined ? { freshnessWindowHours: data.freshnessWindowHours } : {}),
        ...(data.geoFilter !== undefined ? { geoFilter: data.geoFilter?.trim() || null } : {}),
        ...(data.langFilter !== undefined ? { langFilter: data.langFilter?.trim() || null } : {}),
        ...(data.rightsCategory !== undefined ? { rightsCategory: data.rightsCategory } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(themeSources.id, id), eq(themeSources.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return { error: "Theme source not found" };
    }

    return { source: updated };
  } catch (error: any) {
    console.error("Failed to update theme source:", error);
    return { error: "Failed to update theme source" };
  }
}

export async function deleteThemeSource(id: string) {
  try {
    const tenantId = await getActiveTenantId();
    await db.delete(themeSources)
      .where(and(eq(themeSources.id, id), eq(themeSources.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete theme source:", error);
    return { error: "Failed to delete theme source" };
  }
}

export async function toggleThemeSource(id: string) {
  try {
    const tenantId = await getActiveTenantId();
    const existing = await db.query.themeSources.findFirst({
      where: and(eq(themeSources.id, id), eq(themeSources.tenantId, tenantId)),
    });

    if (!existing) {
      return { error: "Theme source not found" };
    }

    const [updated] = await db.update(themeSources)
      .set({
        isActive: !existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(themeSources.id, id))
      .returning();

    return { source: updated };
  } catch (error: any) {
    console.error("Failed to toggle theme source:", error);
    return { error: "Failed to toggle theme source" };
  }
}
