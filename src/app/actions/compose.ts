'use server';

import { db } from "@/lib/db";
import { drafts, socialAccounts } from "@/lib/db/schema";
import { getZernioClient } from "./zernio";
import { publishDraft } from "./publisher";
import { getActiveTenantId } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function createManualPost(data: {
    content: string;
    mediaUrls: string[];
    accountIds: string[];
    scheduleType: "now" | "scheduled" | "draft";
    scheduledFor?: string; // ISO date string
}) {
    try {
        if (!data.content || typeof data.content !== "string" || data.content.trim().length === 0) {
            return { error: "Post content cannot be empty" };
        }
        if (data.content.length > 50000) {
            return { error: "Post content exceeds maximum length of 50,000 characters" };
        }
        if (!Array.isArray(data.accountIds) || data.accountIds.length === 0) {
            return { error: "At least one target account must be selected" };
        }
        if (data.mediaUrls && Array.isArray(data.mediaUrls)) {
            if (data.mediaUrls.length > 10) {
                return { error: "Maximum 10 media URLs allowed" };
            }
            for (const url of data.mediaUrls) {
                if (typeof url !== "string" || (!url.startsWith("http://") && !url.startsWith("https://"))) {
                    return { error: "Invalid media URL format" };
                }
            }
        }
        if (data.scheduleType === "scheduled") {
            if (!data.scheduledFor || isNaN(Date.parse(data.scheduledFor))) {
                return { error: "Please select a valid future date and time for scheduled posting" };
            }
            if (new Date(data.scheduledFor).getTime() < Date.now() - 60000) {
                return { error: "Scheduled time cannot be in the past" };
            }
        }

        const tenantId = await getActiveTenantId(); // auth check
        
        // Fetch active account info to store platformOptions
        const accounts = await db.query.socialAccounts.findMany({
            where: and(
                eq(socialAccounts.tenantId, tenantId),
                eq(socialAccounts.isActive, true)
            )
        });
        
        const selectedAccounts = accounts.filter(a => data.accountIds.includes(a.id));
        if (selectedAccounts.length === 0) {
            return { error: "No valid active accounts selected" };
        }

        // We will create one draft per platform for simplicity and parity with AI agent
        const createdDraftIds: string[] = [];
        const publishFailures: string[] = [];

        const initialStatus = data.scheduleType === "draft"
            ? "pending_review"
            : data.scheduleType === "scheduled"
            ? "scheduled"
            : "approved";

        for (const account of selectedAccounts) {
            const platformOptions = {
                accountId: account.id,
                platform: account.platform,
                mediaUrls: data.mediaUrls,
            };

            const [draft] = await db.insert(drafts).values({
                tenantId,
                content: data.content,
                status: initialStatus,
                platformOptions,
                scheduledFor: data.scheduleType === "scheduled" && data.scheduledFor ? new Date(data.scheduledFor) : null,
            }).returning();

            createdDraftIds.push(draft.id);

            // If "now", trigger publishDraft immediately and collect results
            if (data.scheduleType === "now") {
                const pubRes = await publishDraft(draft.id);
                if (pubRes?.error) {
                    publishFailures.push(`${account.platform} (@${account.accountName}): ${pubRes.error}`);
                }
            }
        }

        if (publishFailures.length > 0) {
            return {
                error: `Published with errors: ${publishFailures.join("; ")}`,
                draftsCreated: createdDraftIds.length
            };
        }

        return { success: true, draftsCreated: createdDraftIds.length };
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
        return { draft };
    } catch (error: any) {
        return { error: error.message || "Failed to fetch draft" };
    }
}
