'use server';

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { drafts, tenants } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

async function getTenantId() {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
        throw new Error("Unauthorized");
    }

    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.ownerId, session.user.id)
    });

    if (!tenant) {
        throw new Error("No tenant found");
    }

    return tenant.id;
}

export async function getDrafts(status?: string) {
    try {
        const tenantId = await getTenantId();
        
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
        const tenantId = await getTenantId();
        
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
        const tenantId = await getTenantId();
        
        await db.update(drafts)
            .set({ content })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to update draft:", error);
        return { error: "Failed to update draft" };
    }
}

export async function approveDraft(draftId: string) {
    try {
        const tenantId = await getTenantId();
        
        await db.update(drafts)
            .set({ status: "approved", errorMessage: null })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to approve draft:", error);
        return { error: "Failed to approve draft" };
    }
}

export async function rejectDraft(draftId: string, feedback: string) {
    try {
        const tenantId = await getTenantId();
        
        await db.update(drafts)
            .set({ status: "rejected", errorMessage: feedback })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to reject draft:", error);
        return { error: "Failed to reject draft" };
    }
}
