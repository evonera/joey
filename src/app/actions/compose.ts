'use server';

import { db } from "@/lib/db";
import { drafts, socialAccounts } from "@/lib/db/schema";
import { manualPostSchema, validatePostForPlatforms } from "@/lib/compose-validation";
import { revalidatePath } from "next/cache";
import { publishDraft } from "./publisher";
import { getActiveTenantId } from "@/lib/auth";
import { eq, and, inArray } from "drizzle-orm";

export async function createManualPost(data: {
    draftId?: string;
    content: string;
    mediaUrls: string[];
    accountIds: string[];
    scheduleType: "now" | "scheduled" | "draft";
    scheduledFor?: string; // ISO date string
}) {
    try {
        const parsed = manualPostSchema.safeParse(data);
        if (!parsed.success) return { error: parsed.error.issues[0].message };
        data = parsed.data;

        const tenantId = await getActiveTenantId(); // auth check
        
        // Fetch active account info to store platformOptions
        const accounts = await db.query.socialAccounts.findMany({
            where: and(
                eq(socialAccounts.tenantId, tenantId),
                eq(socialAccounts.isActive, true)
            )
        });
        
        const selectedAccounts = accounts.filter(a => data.accountIds.includes(a.id));
        if (selectedAccounts.length !== data.accountIds.length) {
            return { error: "One or more selected accounts are unavailable. Refresh your accounts and try again." };
        }

        if (data.scheduleType !== "draft") {
            const error = validatePostForPlatforms(data.content, data.mediaUrls, selectedAccounts.map(a => a.platform));
            if (error) return { error };
        }
        const initialStatus = data.scheduleType === "draft" ? "pending_review" : data.scheduleType === "scheduled" ? "scheduled" : "approved";
        const createdDraftIds = await db.transaction(async (tx) => {
            const ids: string[] = [];
            for (const account of selectedAccounts) {
                const values = {
                    content: data.content,
                    status: initialStatus,
                    platformOptions: { accountId: account.id, platform: account.platform, mediaUrls: data.mediaUrls, source: "compose" },
                    scheduledFor: data.scheduleType === "scheduled" ? new Date(data.scheduledFor!) : null,
                    errorMessage: null,
                };
                if (data.draftId) {
                    const [updated] = await tx.update(drafts).set(values).where(and(
                        eq(drafts.id, data.draftId), eq(drafts.tenantId, tenantId),
                        inArray(drafts.status, ["pending_review", "approved", "rejected", "scheduled"]),
                    )).returning({ id: drafts.id });
                    if (!updated) throw new Error("This draft cannot be edited. It may already be publishing or published.");
                    ids.push(updated.id);
                } else {
                    const [draft] = await tx.insert(drafts).values({ tenantId, ...values }).returning({ id: drafts.id });
                    ids.push(draft.id);
                }
            }
            return ids;
        });
        const publishFailures: string[] = [];
        let processing = false;
        if (data.scheduleType === "now") {
            for (const draftId of createdDraftIds) {
                const result = await publishDraft(draftId);
                if (result.error) publishFailures.push(result.error);
                if (result.status === "publishing") processing = true;
            }
        }
        revalidatePath("/drafts");
        revalidatePath("/calendar");

        if (publishFailures.length > 0) {
            return {
                error: `Published with errors: ${publishFailures.join("; ")}`,
                draftsCreated: createdDraftIds.length, draftIds: createdDraftIds
            };
        }

        return { success: true, draftsCreated: createdDraftIds.length, draftIds: createdDraftIds, processing };
    } catch (error: any) {
        console.error("Failed to create manual post:", error);
        return { error: error.message || "Failed to create post" };
    }
}

export async function getDraftForCompose(draftId: string) {
    try {
        const tenantId = await getActiveTenantId();
        const draft = await db.query.drafts.findFirst({
            where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId))
        });
        if (!draft) return { error: "Draft not found" };
        if (!["pending_review", "approved", "rejected", "scheduled"].includes(draft.status)) return { error: "This draft cannot be edited while publishing or after publication." };
        return { draft };
    } catch (error: any) {
        return { error: error.message || "Failed to fetch draft" };
    }
}
