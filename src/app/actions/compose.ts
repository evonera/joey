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
    scheduleType: "now" | "scheduled";
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

        const tenantId = await getActiveTenantId(); // auth check
        
        // Fetch full account info to store platformOptions
        const accounts = await db.query.socialAccounts.findMany({
            where: eq(socialAccounts.tenantId, tenantId)
        });
        
        const selectedAccounts = accounts.filter(a => data.accountIds.includes(a.id));
        if (selectedAccounts.length === 0) {
            return { error: "No valid accounts selected" };
        }

        // We will create one draft per platform for simplicity and parity with AI agent
        const createdDraftIds: string[] = [];

        for (const account of selectedAccounts) {
            const platformOptions = {
                accountId: account.id,
                platform: account.platform,
                mediaUrls: data.mediaUrls,
            };

            const [draft] = await db.insert(drafts).values({
                tenantId,
                content: data.content,
                status: "approved", // pre-approved since it's manual
                platformOptions,
                scheduledFor: data.scheduleType === "scheduled" && data.scheduledFor ? new Date(data.scheduledFor) : null,
            }).returning();

            createdDraftIds.push(draft.id);

            // If "now", trigger publishDraft immediately
            if (data.scheduleType === "now") {
                // Background execution, fire and forget (or await it depending on UX desired)
                // For a 100% robust UI we might await it, but for multiple platforms this could be slow
                await publishDraft(draft.id);
            }
        }

        return { success: true, draftsCreated: createdDraftIds.length };
    } catch (error: any) {
        console.error("Failed to create manual post:", error);
        return { error: error.message || "Failed to create post" };
    }
}
