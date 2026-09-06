'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { drafts, tenants } from "@/lib/db/schema";
import { eq, and, or, isNotNull, isNull, inArray, desc, ilike } from "drizzle-orm";

export async function getDrafts(status?: string, platform?: string, search?: string) {
    try {
        const tenantId = await getActiveTenantId();
        
        let conditions = [eq(drafts.tenantId, tenantId)];
        
        if (status && status !== "all") {
            if (status === "scheduled") {
                conditions.push(
                    or(
                        eq(drafts.status, "scheduled"),
                        and(eq(drafts.status, "approved"), isNotNull(drafts.scheduledFor))
                    )!
                );
            } else if (status === "approved") {
                conditions.push(
                    and(
                        eq(drafts.status, "approved"),
                        isNull(drafts.scheduledFor)
                    )!
                );
            } else {
                conditions.push(eq(drafts.status, status));
            }
        }

        if (search && search.trim()) {
            conditions.push(ilike(drafts.content, `%${search.trim()}%`));
        }

        const data = await db.query.drafts.findMany({
            where: and(...conditions),
            orderBy: [desc(drafts.createdAt)]
        });

        const filtered = platform && platform !== "all"
            ? data.filter(d => {
                const opts = d.platformOptions as any;
                return opts?.platform?.toLowerCase() === platform.toLowerCase();
            })
            : data;

        return { drafts: filtered };
    } catch (error: any) {
        console.error("Failed to fetch drafts:", error);
        return { error: "Failed to fetch drafts" };
    }
}

export async function getDraftCounts() {
    try {
        const tenantId = await getActiveTenantId();
        const allDrafts = await db.query.drafts.findMany({
            where: eq(drafts.tenantId, tenantId),
            columns: { id: true, status: true, scheduledFor: true }
        });

        const counts: Record<string, number> = {
            all: allDrafts.length,
            pending_review: 0,
            scheduled: 0,
            approved: 0,
            published: 0,
            failed: 0,
            rejected: 0,
        };

        for (const d of allDrafts) {
            if (d.status === "scheduled" || (d.status === "approved" && d.scheduledFor !== null)) {
                counts.scheduled++;
            } else if (d.status === "approved" && d.scheduledFor === null) {
                counts.approved++;
            } else if (counts[d.status] !== undefined) {
                counts[d.status]++;
            }
        }

        return { counts };
    } catch (error: any) {
        return { counts: { all: 0, pending_review: 0, scheduled: 0, approved: 0, published: 0, failed: 0, rejected: 0 } };
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
        if (!content || typeof content !== "string" || content.trim().length === 0) {
            return { error: "Content cannot be empty" };
        }
        if (content.length > 50000) {
            return { error: "Content exceeds maximum length of 50,000 characters" };
        }

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
        if (content && content.length > 50000) {
            return { error: "Content exceeds maximum length of 50,000 characters" };
        }

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
        if (feedback && feedback.length > 5000) {
            return { error: "Feedback exceeds maximum length of 5,000 characters" };
        }

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

export async function deleteDraft(draftId: string) {
    try {
        const tenantId = await getActiveTenantId();
        await db.delete(drafts)
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete draft:", error);
        return { error: error.message || "Failed to delete draft" };
    }
}

export async function bulkApproveDrafts(draftIds: string[]) {
    try {
        if (!draftIds || draftIds.length === 0) return { success: true, count: 0 };
        const tenantId = await getActiveTenantId();
        await db.update(drafts)
            .set({ status: "approved", errorMessage: null })
            .where(and(inArray(drafts.id, draftIds), eq(drafts.tenantId, tenantId)));

        return { success: true, count: draftIds.length };
    } catch (error: any) {
        console.error("Failed to bulk approve drafts:", error);
        return { error: error.message || "Failed to bulk approve drafts" };
    }
}

export async function bulkRejectDrafts(draftIds: string[], feedback?: string) {
    try {
        if (!draftIds || draftIds.length === 0) return { success: true, count: 0 };
        const tenantId = await getActiveTenantId();
        await db.update(drafts)
            .set({ status: "rejected", errorMessage: feedback || "Rejected via bulk action" })
            .where(and(inArray(drafts.id, draftIds), eq(drafts.tenantId, tenantId)));

        return { success: true, count: draftIds.length };
    } catch (error: any) {
        console.error("Failed to bulk reject drafts:", error);
        return { error: error.message || "Failed to bulk reject drafts" };
    }
}

export async function bulkDeleteDrafts(draftIds: string[]) {
    try {
        if (!draftIds || draftIds.length === 0) return { success: true, count: 0 };
        const tenantId = await getActiveTenantId();
        await db.delete(drafts)
            .where(and(inArray(drafts.id, draftIds), eq(drafts.tenantId, tenantId)));

        return { success: true, count: draftIds.length };
    } catch (error: any) {
        console.error("Failed to bulk delete drafts:", error);
        return { error: error.message || "Failed to bulk delete drafts" };
    }
}
