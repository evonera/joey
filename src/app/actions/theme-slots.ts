'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { themeSlots, themePages, themeContentFormats } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

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
    const tenantId = await getActiveTenantId();

    const page = await db.query.themePages.findFirst({
      where: and(eq(themePages.id, data.themePageId), eq(themePages.tenantId, tenantId)),
    });
    if (!page) {
      return { error: "Theme page not found" };
    }

    const format = await db.query.themeContentFormats.findFirst({
      where: and(eq(themeContentFormats.id, data.formatId), eq(themeContentFormats.tenantId, tenantId)),
    });
    if (!format) {
      return { error: "Content format not found" };
    }

    const existingSlots = await db.query.themeSlots.findMany({
      where: and(eq(themeSlots.themePageId, data.themePageId), eq(themeSlots.tenantId, tenantId)),
    });

    const priority = data.priority ?? existingSlots.length;

    const [slot] = await db.insert(themeSlots).values({
      tenantId,
      themePageId: data.themePageId,
      formatId: data.formatId,
      label: data.label?.trim() || format.name,
      cadence: data.cadence || 'daily',
      daysOfWeek: data.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
      priority,
      overrideTemplateId: data.overrideTemplateId || null,
      isActive: true,
    }).returning();

    return { slot: { ...slot, format } };
  } catch (error: any) {
    console.error("Failed to create theme slot:", error);
    return { error: "Failed to create theme slot" };
  }
}

export async function updateThemeSlot(id: string, data: UpdateThemeSlotInput) {
  try {
    const tenantId = await getActiveTenantId();

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
    const tenantId = await getActiveTenantId();
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
    const tenantId = await getActiveTenantId();

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
