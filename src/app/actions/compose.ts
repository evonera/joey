'use server';

import { db } from "@/lib/db";
import { drafts, socialAccounts } from "@/lib/db/schema";
import { manualPostSchema, validatePostForPlatforms } from "@/lib/compose-validation";
import { revalidatePath } from "next/cache";
import { publishDraft } from "./publisher";
import { getActiveTenantId, getActiveTenantMembership } from "@/lib/auth";
import { eq, and, inArray, sql } from "drizzle-orm";
import { assertAvailableSchedule, assertSchedulingRole, lockSchedulingAccount } from "@/lib/editorial-scheduling";

export async function getComposeAutosaveScope() {
    const { userId, tenantId } = await getActiveTenantMembership();
    return `${userId}:${tenantId}`;
}

export async function createManualPost(data: {
    draftId?: string;
    content: string;
    mediaUrls: string[];
    accountIds: string[];
    scheduleType: "now" | "scheduled" | "draft";
    scheduledFor?: string; // ISO date string
    confirmedAt?: string; // ISO date string; required for immediate publish (confirm dialog)
}) {
    try {
        const parsed = manualPostSchema.safeParse(data);
        if (!parsed.success) return { error: parsed.error.issues[0].message };
        data = parsed.data;

        const { tenantId, role, userId } = await getActiveTenantMembership(
            data.scheduleType === "draft" ? undefined : ["owner", "admin"],
        );
        
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
        const initialStatus = data.scheduleType === "draft" ? "draft" : data.scheduleType === "scheduled" ? "scheduled" : "approved";
        const createdDraftIds = await db.transaction(async (tx) => {
            if (data.scheduleType === "scheduled") {
                // Stable lock order prevents multi-account confirmation deadlocks.
                for (const account of [...selectedAccounts].sort((a, b) => a.id.localeCompare(b.id))) {
                    await lockSchedulingAccount(tx, tenantId, account.id);
                    await assertAvailableSchedule(tx, tenantId, account.id, new Date(data.scheduledFor!), data.draftId);
                }
                await assertSchedulingRole(tx, tenantId, userId);
            }
            const ids: string[] = [];
            const targets: Array<typeof selectedAccounts[number] | null> = selectedAccounts.length > 0 ? selectedAccounts : [null];
            for (const account of targets) {
                const values = {
                    content: data.content,
                    status: initialStatus,
                    platformOptions: { ...(account ? { accountId: account.id, platform: account.platform } : {}), mediaUrls: data.mediaUrls, source: "compose" },
                    scheduledFor: data.scheduleType === "scheduled" ? new Date(data.scheduledFor!) : null,
                    errorMessage: null,
                };
                if (data.draftId) {
                    const existing = await tx.query.drafts.findFirst({
                        where: and(eq(drafts.id, data.draftId), eq(drafts.tenantId, tenantId)),
                    });
                    if (!existing) throw new Error("Draft not found.");
                    const existingOptions = existing.platformOptions as { accountId?: unknown; source?: unknown; renderJobId?: unknown; renderStatus?: unknown } | null;
                    const currentAccountId = existingOptions?.accountId;
                    if (typeof currentAccountId === "string" && currentAccountId !== account?.id) {
                        throw new Error("This draft belongs to a different account. Start a new post to change its destination.");
                    }
                    if (existingOptions?.source === "chat_video" && existingOptions.renderJobId && existingOptions.renderStatus !== "succeeded" && data.scheduleType !== "draft") {
                        throw new Error("Wait for the finished video before scheduling or publishing this draft.");
                    }
                    const videoOptions = {
                        ...(account ? { accountId: account.id, platform: account.platform } : {}),
                        ...(data.mediaUrls.length ? { mediaUrls: data.mediaUrls } : {}),
                        source: "chat_video",
                    };
                    const updatedValues = existingOptions?.source === "chat_video"
                        ? { ...values, platformOptions: sql`coalesce(${drafts.platformOptions}, '{}'::jsonb) || ${JSON.stringify(videoOptions)}::jsonb` }
                        : values;
                    const [updated] = await tx.update(drafts).set(updatedValues).where(and(
                        eq(drafts.id, data.draftId), eq(drafts.tenantId, tenantId),
                        inArray(drafts.status, role === "owner" || role === "admin"
                            ? ["draft", "pending_review", "approved", "rejected", "scheduled"]
                            : ["draft", "pending_review", "rejected"]),
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
        const publicationResults: Array<{ draftId: string; accountId: string; platform: string; status: string; error?: string }> = [];
        let processing = false;
        if (data.scheduleType === "now") {
            for (const [index, draftId] of createdDraftIds.entries()) {
                const result = await publishDraft(draftId);
                if (result.error) publishFailures.push(result.error);
                if (result.status === "publishing") processing = true;
                publicationResults.push({
                    draftId,
                    accountId: selectedAccounts[index].id,
                    platform: selectedAccounts[index].platform,
                    status: result.error ? "failed" : result.status || "publishing",
                    ...(result.error ? { error: result.error } : {}),
                });
            }
        }
        revalidatePath("/drafts");
        revalidatePath("/calendar");

        if (publishFailures.length > 0) {
            return {
                error: `Published with errors: ${publishFailures.join("; ")}`,
                draftsCreated: createdDraftIds.length, draftIds: createdDraftIds, publicationResults
            };
        }

        return { success: true, draftsCreated: createdDraftIds.length, draftIds: createdDraftIds, processing, publicationResults };
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
        if (!["draft", "pending_review", "approved", "rejected", "scheduled"].includes(draft.status)) return { error: "This draft cannot be edited while publishing or after publication." };
        return { draft };
    } catch (error: any) {
        return { error: error.message || "Failed to fetch draft" };
    }
}
