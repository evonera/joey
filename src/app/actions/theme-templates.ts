'use server';

import { invalidateThemeMedia } from "@/lib/media-engine/invalidation";
import { getActiveTenantId, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { themeVisualTemplates, themeContentFormats, themeSlots, themePages } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

import { normalizeThemeDesign, parseThemeDesign, themeDesignSchema } from "@/lib/theme-studio/design-spec";
import { z } from "zod";

function sanitizeComponentSpec(input: Record<string, unknown>): Record<string, unknown> | null {
  const parsed = themeDesignSchema.safeParse(normalizeThemeDesign(input));
  return parsed.success ? parsed.data : null;
}

export interface CreateThemeTemplateInput {
  themePageId?: string;
  name: string;
  formatId: string;
  renderer: 'puppeteer' | 'remotion';
  componentSpec: Record<string, unknown>;
  propsSchema?: Record<string, unknown>;
  previewUrl?: string;
}

export interface UpdateThemeTemplateInput {
  name?: string;
  formatId?: string;
  renderer?: 'puppeteer' | 'remotion';
  componentSpec?: Record<string, unknown>;
  propsSchema?: Record<string, unknown>;
  previewUrl?: string;
}

export async function getThemeTemplates(themePageId?: string) {
  try {
    const tenantId = await getActiveTenantId();
    let whereCondition = eq(themeVisualTemplates.tenantId, tenantId);

    if (themePageId) {
      whereCondition = and(
        eq(themeVisualTemplates.tenantId, tenantId),
        eq(themeVisualTemplates.themePageId, themePageId),
      )!;
    }

    const templates = await db.query.themeVisualTemplates.findMany({
      where: whereCondition,
      orderBy: [desc(themeVisualTemplates.updatedAt)],
    });

    const formats = await db.query.themeContentFormats.findMany({
      where: eq(themeContentFormats.tenantId, tenantId),
    });
    const formatMap = new Map(formats.map(f => [f.id, f]));

    const enriched = templates.map(t => ({
      ...t,
      componentSpec: normalizeThemeDesign(t.componentSpec),
      format: formatMap.get(t.formatId) || null,
    }));

    return { templates: enriched };
  } catch (error: any) {
    console.error("Failed to fetch theme templates:", error);
    return { error: "Failed to fetch theme templates" };
  }
}

export async function getThemeTemplateById(id: string) {
  try {
    const tenantId = await getActiveTenantId();
    const template = await db.query.themeVisualTemplates.findFirst({
      where: and(eq(themeVisualTemplates.id, id), eq(themeVisualTemplates.tenantId, tenantId)),
    });

    if (!template) {
      return { error: "Template not found" };
    }

    const format = await db.query.themeContentFormats.findFirst({
      where: and(eq(themeContentFormats.id, template.formatId), eq(themeContentFormats.tenantId, tenantId)),
    });

    return { template: { ...template, componentSpec: normalizeThemeDesign(template.componentSpec), format } };
  } catch (error: any) {
    console.error("Failed to fetch theme template:", error);
    return { error: "Failed to fetch theme template" };
  }
}

export async function createThemeTemplate(data: CreateThemeTemplateInput) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);

    if (!data.name || !data.name.trim()) {
      return { error: "Template name is required" };
    }
    if (!data.componentSpec) {
      return { error: "Component specification is required" };
    }
    const componentSpec = sanitizeComponentSpec(data.componentSpec);
    if (!componentSpec) return { error: "Template specification contains unsupported values" };

    const format = await db.query.themeContentFormats.findFirst({
      where: and(eq(themeContentFormats.id, data.formatId), eq(themeContentFormats.tenantId, tenantId)),
    });
    if (!format) {
      return { error: "Content format not found" };
    }
    if (data.themePageId) {
      const page = await db.query.themePages.findFirst({
        where: and(eq(themePages.id, data.themePageId), eq(themePages.tenantId, tenantId)),
        columns: { id: true },
      });
      if (!page) return { error: "Theme page not found" };
    }

    const [template] = await db.insert(themeVisualTemplates).values({
      tenantId,
      themePageId: data.themePageId || null,
      name: data.name.trim(),
      formatId: data.formatId,
      renderer: data.renderer || format.renderer,
      componentSpec,
      propsSchema: data.propsSchema || format.defaultPropsSchema || null,
      previewUrl: data.previewUrl || null,
      version: 1,
    }).returning();

    return { template: { ...template, componentSpec: normalizeThemeDesign(template.componentSpec), format } };
  } catch (error: any) {
    console.error("Failed to create theme template:", error);
    return { error: "Failed to create theme template" };
  }
}

export async function updateThemeTemplate(id: string, data: UpdateThemeTemplateInput) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);

    const existing = await db.query.themeVisualTemplates.findFirst({
      where: and(eq(themeVisualTemplates.id, id), eq(themeVisualTemplates.tenantId, tenantId)),
    });

    if (!existing) {
      return { error: "Theme template not found" };
    }
    const componentSpec = data.componentSpec !== undefined ? sanitizeComponentSpec(data.componentSpec) : undefined;
    if (data.componentSpec !== undefined && !componentSpec) return { error: "Template specification contains unsupported values" };

    let format = null;
    if (data.formatId !== undefined) {
      format = await db.query.themeContentFormats.findFirst({
        where: and(eq(themeContentFormats.id, data.formatId), eq(themeContentFormats.tenantId, tenantId)),
      });
      if (!format) return { error: "Content format not found" };
    }

    const updated = await db.transaction(async tx => {
    const [row] = await tx.update(themeVisualTemplates)
      .set({
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.formatId !== undefined ? { formatId: data.formatId } : {}),
        ...(data.renderer !== undefined ? { renderer: data.renderer } : {}),
        ...(componentSpec !== undefined ? { componentSpec } : {}),
        ...(data.propsSchema !== undefined ? { propsSchema: data.propsSchema } : {}),
        ...(data.previewUrl !== undefined ? { previewUrl: data.previewUrl } : {}),
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(themeVisualTemplates.id, id), eq(themeVisualTemplates.tenantId, tenantId)))
      .returning();
      if (row) await invalidateThemeMedia(tx, tenantId, { kind: "template", id }, data.componentSpec !== undefined || data.formatId !== undefined || data.renderer !== undefined || data.propsSchema !== undefined);
      return row;
    });

    return { template: updated };
  } catch (error: any) {
    console.error("Failed to update theme template:", error);
    return { error: "Failed to update theme template" };
  }
}

export async function deleteThemeTemplate(id: string) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);

    // Check if slots are using this template as override
    const slotsUsingTemplate = await db.query.themeSlots.findMany({
      where: and(eq(themeSlots.overrideTemplateId, id), eq(themeSlots.tenantId, tenantId)),
      limit: 1,
    });

    if (slotsUsingTemplate.length > 0) {
      return { error: "Cannot delete template: it is currently used as an override in one or more slots" };
    }

    await db.delete(themeVisualTemplates)
      .where(and(eq(themeVisualTemplates.id, id), eq(themeVisualTemplates.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete theme template:", error);
    return { error: "Failed to delete theme template" };
  }
}

export async function previewThemeTemplate(input: unknown) {
  const tenantId = await getActiveTenantId();
  const request = z.object({ formatId: z.string().max(128), themePageId: z.string().max(128).optional(), componentSpec: z.record(z.string(), z.unknown()), sample: z.object({ title: z.string().max(500), summary: z.string().max(1000), source_name: z.string().max(200), author: z.string().max(120), tag: z.string().max(80), date: z.string().max(80) }).strict() }).strict().parse(input);
  const component = parseThemeDesign(request.componentSpec);
  const format = await db.query.themeContentFormats.findFirst({ where: and(eq(themeContentFormats.id, request.formatId), eq(themeContentFormats.tenantId, tenantId)) });
  if (!format) throw new Error("Content format not found.");
  const page = request.themePageId ? await db.query.themePages.findFirst({ where: and(eq(themePages.id, request.themePageId), eq(themePages.tenantId, tenantId)) }) : undefined;
  if (request.themePageId && !page) throw new Error("Theme page not found.");
  const { designBrandKit, renderStaticThemeSvgs } = await import("@/lib/theme-studio/renderers/static-theme");
  const { applyDesignCopy } = await import("@/lib/theme-studio/template-copy");
  const { renderSvgPng } = await import("@/lib/theme-studio/renderers/rasterize-svg");
  const svgs = renderStaticThemeSvgs({ component, brandKit: designBrandKit((page?.brandKit ?? {}) as Record<string, unknown>, component),
    title: applyDesignCopy(component.titleTemplate, request.sample.title, request.sample), body: applyDesignCopy(component.bodyTemplate, request.sample.summary, request.sample),
    sourceName: request.sample.source_name, pageName: page?.name ?? "Theme Page", heroImage: component.bgImageUrl,
    mediaType: format.mediaType, slug: format.slug, aspectRatio: format.aspectRatio,
    facts: [{ claim: request.sample.summary }],
  });
  const images: string[] = [];
  const cache = new Map<string, Buffer>();
  for (const svg of svgs) images.push(`data:image/png;base64,${(await renderSvgPng(svg, undefined, cache)).toString("base64")}`);
  return { images };
}
