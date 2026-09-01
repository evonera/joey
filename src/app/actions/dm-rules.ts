'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { dmAutomationRules, themePages } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export interface CreateDmRuleInput {
  themePageId: string;
  triggerType?: string;
  triggerValue: string;
  responseTemplate: string;
  responseLink?: string;
}

export interface UpdateDmRuleInput {
  triggerType?: string;
  triggerValue?: string;
  responseTemplate?: string;
  responseLink?: string;
  isActive?: boolean;
}

export async function getDmRules(themePageId: string) {
  try {
    const tenantId = await getActiveTenantId();
    const rules = await db.query.dmAutomationRules.findMany({
      where: and(eq(dmAutomationRules.themePageId, themePageId), eq(dmAutomationRules.tenantId, tenantId)),
      orderBy: [desc(dmAutomationRules.createdAt)],
    });
    return { rules };
  } catch (error: any) {
    console.error("Failed to fetch DM rules:", error);
    return { error: "Failed to fetch DM rules" };
  }
}

export async function createDmRule(data: CreateDmRuleInput) {
  try {
    const tenantId = await getActiveTenantId();

    if (!data.triggerValue || !data.triggerValue.trim()) {
      return { error: "Trigger keyword is required" };
    }
    if (!data.responseTemplate || !data.responseTemplate.trim()) {
      return { error: "Response template is required" };
    }
    if (data.triggerValue.trim().length > 80) return { error: "Trigger keyword is too long" };
    if (data.responseTemplate.trim().length > 2000) return { error: "Response message is too long" };
    if (data.responseLink) {
      try { if (new URL(data.responseLink).protocol !== "https:") return { error: "Response link must use HTTPS" }; }
      catch { return { error: "Response link is invalid" }; }
    }

    const page = await db.query.themePages.findFirst({
      where: and(eq(themePages.id, data.themePageId), eq(themePages.tenantId, tenantId)),
    });
    if (!page) {
      return { error: "Theme page not found" };
    }

    const [rule] = await db.insert(dmAutomationRules).values({
      tenantId,
      themePageId: data.themePageId,
      triggerType: data.triggerType || 'keyword',
      triggerValue: data.triggerValue.trim().toUpperCase(),
      responseTemplate: data.responseTemplate.trim(),
      responseLink: data.responseLink?.trim() || null,
      isActive: true,
      stats: { triggered: 0, dmsSent: 0, clicks: 0 },
    }).returning();

    return { rule };
  } catch (error: any) {
    console.error("Failed to create DM rule:", error);
    return { error: "Failed to create DM rule" };
  }
}

export async function updateDmRule(id: string, data: UpdateDmRuleInput) {
  try {
    const tenantId = await getActiveTenantId();
    if (data.triggerType !== undefined && data.triggerType !== "keyword") return { error: "Unsupported DM trigger type" };
    if (data.triggerValue !== undefined && (!data.triggerValue.trim() || data.triggerValue.trim().length > 80)) return { error: "Trigger keyword must be between 1 and 80 characters" };
    if (data.responseTemplate !== undefined && (!data.responseTemplate.trim() || data.responseTemplate.trim().length > 2000)) return { error: "Response message must be between 1 and 2000 characters" };
    if (data.responseLink) {
      try { if (new URL(data.responseLink).protocol !== "https:") return { error: "Response link must use HTTPS" }; }
      catch { return { error: "Response link is invalid" }; }
    }

    const [updated] = await db.update(dmAutomationRules)
      .set({
        ...(data.triggerType !== undefined ? { triggerType: data.triggerType } : {}),
        ...(data.triggerValue !== undefined ? { triggerValue: data.triggerValue.trim().toUpperCase() } : {}),
        ...(data.responseTemplate !== undefined ? { responseTemplate: data.responseTemplate.trim() } : {}),
        ...(data.responseLink !== undefined ? { responseLink: data.responseLink?.trim() || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(dmAutomationRules.id, id), eq(dmAutomationRules.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return { error: "DM rule not found" };
    }

    return { rule: updated };
  } catch (error: any) {
    console.error("Failed to update DM rule:", error);
    return { error: "Failed to update DM rule" };
  }
}

export async function deleteDmRule(id: string) {
  try {
    const tenantId = await getActiveTenantId();
    await db.delete(dmAutomationRules)
      .where(and(eq(dmAutomationRules.id, id), eq(dmAutomationRules.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete DM rule:", error);
    return { error: "Failed to delete DM rule" };
  }
}

export async function toggleDmRule(id: string) {
  try {
    const tenantId = await getActiveTenantId();
    const existing = await db.query.dmAutomationRules.findFirst({
      where: and(eq(dmAutomationRules.id, id), eq(dmAutomationRules.tenantId, tenantId)),
    });

    if (!existing) {
      return { error: "DM rule not found" };
    }

    const [updated] = await db.update(dmAutomationRules)
      .set({
        isActive: !existing.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(dmAutomationRules.id, id), eq(dmAutomationRules.tenantId, tenantId)))
      .returning();

    return { rule: updated };
  } catch (error: any) {
    console.error("Failed to toggle DM rule:", error);
    return { error: "Failed to toggle DM rule" };
  }
}
