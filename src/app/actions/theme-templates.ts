'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { themeVisualTemplates, themeContentFormats, themeSlots, themePages } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|[a-z]{3,20})$/i;
const GRADIENT = /^linear-gradient\([\d\s.,%#a-z()+-]{1,300}\)$/i;

function sanitizeComponentSpec(input: Record<string, unknown>): Record<string, unknown> | null {
  const output: Record<string, unknown> = {};
  const colorFields = ["backgroundColor", "textColor", "accentColor"] as const;
  for (const field of colorFields) {
    const value = input[field];
    if (value !== undefined) {
      if (typeof value !== "string" || !COLOR.test(value.trim())) return null;
      output[field] = value.trim();
    }
  }
  if (input.backgroundGradient !== undefined) {
    if (typeof input.backgroundGradient !== "string" || !GRADIENT.test(input.backgroundGradient.trim())) return null;
    output.backgroundGradient = input.backgroundGradient.trim();
  }
  if (input.fontFamily !== undefined) {
    if (typeof input.fontFamily !== "string" || !/^[\w\s,'-]{1,100}$/.test(input.fontFamily)) return null;
    output.fontFamily = input.fontFamily;
  }
  for (const [field, min, max] of [
    ["titleSize", 18, 72], ["bodySize", 12, 40], ["padding", 0, 160], ["borderRadius", 0, 100],
  ] as const) {
    const value = input[field];
    if (value !== undefined) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return null;
      output[field] = value;
    }
  }
  for (const field of ["showWatermark", "showSlideIndicator"] as const) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== "boolean") return null;
      output[field] = input[field];
    }
  }
  for (const field of ["watermarkText", "titleTemplate", "bodyTemplate"] as const) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== "string" || input[field].length > 500) return null;
      output[field] = input[field];
    }
  }
  return output;
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

    return { template: { ...template, format } };
  } catch (error: any) {
    console.error("Failed to fetch theme template:", error);
    return { error: "Failed to fetch theme template" };
  }
}

export async function createThemeTemplate(data: CreateThemeTemplateInput) {
  try {
    const tenantId = await getActiveTenantId();

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

    return { template: { ...template, format } };
  } catch (error: any) {
    console.error("Failed to create theme template:", error);
    return { error: "Failed to create theme template" };
  }
}

export async function updateThemeTemplate(id: string, data: UpdateThemeTemplateInput) {
  try {
    const tenantId = await getActiveTenantId();

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

    const [updated] = await db.update(themeVisualTemplates)
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

    return { template: updated };
  } catch (error: any) {
    console.error("Failed to update theme template:", error);
    return { error: "Failed to update theme template" };
  }
}

export async function deleteThemeTemplate(id: string) {
  try {
    const tenantId = await getActiveTenantId();

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
