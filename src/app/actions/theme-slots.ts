'use server';

import { getActiveTenantId, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { themeSlots, themeContentFormats, themeVisualTemplates } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

import { SlotQuotaError } from "@/lib/billing";
import { insertThemeSlot } from "@/lib/theme-studio/slots";

export interface CreateThemeSlotInput {
  themePageId: string;
  formatId: string;
  label?: string;
  cadence?: string;
  daysOfWeek?: number[];
  priority?: number;
  overrideTemplateId?: string;
}

export interface UpdateThemeSlotInput {
  formatId?: string;
  label?: string;
  cadence?: string;
  daysOfWeek?: number[];
  priority?: number;
  overrideTemplateId?: string;
  isActive?: boolean;
}

export async function getThemeSlots(themePageId: string) {
  try {
    const tenantId = await getActiveTenantId();
    const slots = await db.query.themeSlots.findMany({
      where: and(eq(themeSlots.themePageId, themePageId), eq(themeSlots.tenantId, tenantId)),
      orderBy: [asc(themeSlots.priority)],
    });

    const formats = await db.query.themeContentFormats.findMany({
      where: eq(themeContentFormats.tenantId, tenantId),
    });

    const formatMap = new Map(formats.map(f => [f.id, f]));

    const slotsWithFormats = slots.map(slot => ({
      ...slot,
      format: formatMap.get(slot.formatId) || null,
    }));

    return { slots: slotsWithFormats };
  } catch (error: any) {
    console.error("Failed to fetch theme slots:", error);
    return { error: "Failed to fetch theme slots" };
  }
}

export async function createThemeSlot(data: CreateThemeSlotInput) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);

    return await insertThemeSlot(tenantId, data);
  } catch (error: any) {
    if (error instanceof SlotQuotaError) return { error: error.message };
    console.error("Failed to create theme slot:", error);
    return { error: "Failed to create theme slot" };
  }
}

export async function updateThemeSlot(id: string, data: UpdateThemeSlotInput) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    const existing = await db.query.themeSlots.findFirst({
      where: and(eq(themeSlots.id, id), eq(themeSlots.tenantId, tenantId)),
    });
    if (!existing) return { error: "Theme slot not found" };
    const formatId = data.formatId ?? existing.formatId;
    const format = await db.query.themeContentFormats.findFirst({
      where: and(eq(themeContentFormats.id, formatId), eq(themeContentFormats.tenantId, tenantId)),
      columns: { id: true, mediaType: true },
    });
    if (!format) return { error: "Content format not found" };
    if (data.overrideTemplateId) {
      const template = await db.query.themeVisualTemplates.findFirst({
        where: and(
          eq(themeVisualTemplates.id, data.overrideTemplateId),
          eq(themeVisualTemplates.tenantId, tenantId),
          eq(themeVisualTemplates.formatId, formatId),
        ),
        columns: { id: true },
      });
      if (!template) return { error: "Template is not available for this content format" };
    }

    const [updated] = await db.update(themeSlots)
      .set({
        ...(data.formatId !== undefined ? { formatId: data.formatId } : {}),
        ...(data.label !== undefined ? { label: data.label?.trim() || null } : {}),
        ...(data.cadence !== undefined ? { cadence: data.cadence } : {}),
        ...(data.daysOfWeek !== undefined ? { daysOfWeek: data.daysOfWeek } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.overrideTemplateId !== undefined ? { overrideTemplateId: data.overrideTemplateId || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(themeSlots.id, id), eq(themeSlots.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return { error: "Theme slot not found" };
    }

    return { slot: updated };
  } catch (error: any) {
    console.error("Failed to update theme slot:", error);
    return { error: "Failed to update theme slot" };
  }
}

export async function deleteThemeSlot(id: string) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    await db.delete(themeSlots)
      .where(and(eq(themeSlots.id, id), eq(themeSlots.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete theme slot:", error);
    return { error: "Failed to delete theme slot" };
  }
}

export async function reorderThemeSlots(themePageId: string, orderedSlotIds: string[]) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);

    for (let i = 0; i < orderedSlotIds.length; i++) {
      await db.update(themeSlots)
        .set({ priority: i, updatedAt: new Date() })
        .where(and(eq(themeSlots.id, orderedSlotIds[i]), eq(themeSlots.themePageId, themePageId), eq(themeSlots.tenantId, tenantId)));
    }

    return { success: true };
  } catch (error: any) {
    console.error("Failed to reorder theme slots:", error);
    return { error: "Failed to reorder theme slots" };
  }
}
