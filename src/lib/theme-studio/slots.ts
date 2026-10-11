import { db } from "@/lib/db";
import { themeSlots, themePages, themeContentFormats, themeVisualTemplates, tenants } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { assertThemeSlotQuota } from "@/lib/billing";

export interface NewThemeSlot {
  themePageId: string; formatId: string; label?: string; cadence?: string;
  daysOfWeek?: number[]; priority?: number; overrideTemplateId?: string;
}

export async function insertThemeSlot(tenantId: string, data: NewThemeSlot) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM ${tenants} WHERE id = ${tenantId} FOR SHARE`);
    await tx.execute(sql`SELECT id FROM ${themePages} WHERE id = ${data.themePageId} AND tenant_id = ${tenantId} FOR UPDATE`);
    const page = await tx.query.themePages.findFirst({
      where: and(eq(themePages.id, data.themePageId), eq(themePages.tenantId, tenantId)),
    });
    if (!page) {
      return { error: "Theme page not found" };
    }

    const format = await tx.query.themeContentFormats.findFirst({
      where: and(eq(themeContentFormats.id, data.formatId), eq(themeContentFormats.tenantId, tenantId)),
    });
    if (!format) {
      return { error: "Content format not found" };
    }
    if (data.overrideTemplateId) {
      const template = await tx.query.themeVisualTemplates.findFirst({
        where: and(
          eq(themeVisualTemplates.id, data.overrideTemplateId),
          eq(themeVisualTemplates.tenantId, tenantId),
          eq(themeVisualTemplates.formatId, data.formatId),
        ),
        columns: { id: true },
      });
      if (!template) return { error: "Template is not available for this content format" };
    }

    await assertThemeSlotQuota(tenantId, data.themePageId, tx);

    const existingSlots = await tx.query.themeSlots.findMany({
      where: and(eq(themeSlots.themePageId, data.themePageId), eq(themeSlots.tenantId, tenantId)),
    });

    const priority = data.priority ?? existingSlots.length;

    const [slot] = await tx.insert(themeSlots).values({
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
  });
}
