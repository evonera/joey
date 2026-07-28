'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { drafts, tenants } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function getDrafts(status?: string) {
    try {
        const tenantId = await getActiveTenantId();
        
        let conditions = [eq(drafts.tenantId, tenantId)];
        if (status) {
            conditions.push(eq(drafts.status, status));
        }

        const data = await db.query.drafts.findMany({
            where: and(...conditions),
            orderBy: [desc(drafts.createdAt)]
        });

        return { drafts: data };
    } catch (error: any) {
        console.error("Failed to fetch drafts:", error);
        return { error: "Failed to fetch drafts" };
    }
}

export async function getPendingDraftCount() {
    try {
        const tenantId = await getActiveTenantId();
        
        const data = await db.query.drafts.findMany({
            where: and(eq(drafts.tenantId, tenantId), eq(drafts.status, "pending_review")),
            columns: { id: true }
        });

        return { count: data.length };
    } catch (error: any) {
        console.error("Failed to fetch pending draft count:", error);
        return { count: 0 };
    }
}

export async function updateDraft(draftId: string, content: string) {
    try {
        const tenantId = await getActiveTenantId();
        
        await db.update(drafts)
            .set({ content })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to update draft:", error);
        return { error: "Failed to update draft" };
    }
}

export async function approveDraft(draftId: string, variantName?: string, content?: string) {
    try {
        const tenantId = await getActiveTenantId();
        
        const updateData: Partial<typeof drafts.$inferInsert> & { status: string; errorMessage: null } = { status: "approved", errorMessage: null };
        if (variantName && content) {
            updateData.selectedVariantId = variantName;
            updateData.content = content;
        } else {
            const existing = await db.query.drafts.findFirst({
                where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)),
                columns: { content: true }
            });
            if (!existing?.content) {
                return { error: "Cannot approve a draft without content. Please select a variant." };
            }
        }

        await db.update(drafts)
            .set(updateData)
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to approve draft:", error);
        return { error: "Failed to approve draft" };
    }
}

export async function rejectDraft(draftId: string, feedback: string) {
    try {
        const tenantId = await getActiveTenantId();
        
        await db.update(drafts)
            .set({ status: "rejected", errorMessage: feedback })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to reject draft:", error);
        return { error: "Failed to reject draft" };
    }
}
