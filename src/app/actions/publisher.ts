'use server';

import { executePublishDraft, getZernioClientForTenant } from "@/lib/publisher-core";
import { requireRole } from "@/lib/auth";

// Server Action for UI
export async function publishDraft(draftId: string, publishEarly = false): Promise<{ success?: boolean; error?: string; status?: string }> {
    try {
        const tenantId = await requireRole(["owner", "admin"]);
        const { zernio } = await getZernioClientForTenant(tenantId);

        // Check if draftId is a Theme Studio content package
        const { db } = await import("@/lib/db");
        const { contentPackages } = await import("@/lib/db/schema");
        const { eq, and } = await import("drizzle-orm");

        const pkg = await db.query.contentPackages.findFirst({
            where: and(eq(contentPackages.id, draftId), eq(contentPackages.tenantId, tenantId)),
        });

        if (pkg) {
            const { publishContentPackage } = await import("@/lib/theme-studio/publishing/publisher");
            const res = await publishContentPackage(draftId, tenantId, publishEarly === true);
            if (!res.success) {
                return { error: res.error || "Failed to publish content package" };
            }
            return { success: true, status: res.status };
        }

        return await executePublishDraft(draftId, tenantId, zernio, publishEarly === true);
    } catch (error: any) {
        console.error("Failed to publish draft:", error);
        return { error: error.message || "An unexpected error occurred." };
    }
}
