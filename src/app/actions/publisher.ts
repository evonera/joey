'use server';

import { db } from "@/lib/db";
import { drafts, posts, socialAccounts, agentConfigs, apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getZernioClient } from "./zernio";
import { decrypt } from "@/lib/crypto";
import Zernio from "@zernio/node";

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Internal helper for background cron jobs to get Zernio client without an HTTP session
export async function getZernioClientForTenant(tenantId: string) {
    const key = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.tenantId, tenantId)
    });

    if (!key || !key.encryptedKey) {
        throw new Error("No API key configured for this tenant");
    }

    const apiKey = decrypt(key.encryptedKey);
    return { zernio: new Zernio({ apiKey }), tenantId };
}

// Reusable core logic for publishing a draft
export async function executePublishDraft(draftId: string, tenantId: string, zernio: Zernio, skipPreflight: boolean = false) {
    // 1. Fetch the draft
    const draft = await db.query.drafts.findFirst({
        where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId))
    });

    if (!skipPreflight) {
        if (!draft || (draft.status !== "approved" && draft.status !== "failed")) {
            return { error: "Draft not found or not ready to publish." };
        }
    }

    try {

    const platformOpts = draft.platformOptions as any;
    const targetPlatform = platformOpts?.platform;
    const accountId = platformOpts?.accountId;

    // 2. Look up the corresponding Zernio account ID from socialAccounts
    let account = null;
    if (accountId) {
        account = await db.query.socialAccounts.findFirst({
            where: and(
                eq(socialAccounts.tenantId, tenantId),
                eq(socialAccounts.id, accountId)
            )
        });
    } else {
        account = await db.query.socialAccounts.findFirst({
            where: and(
                eq(socialAccounts.tenantId, tenantId),
                eq(socialAccounts.platform, targetPlatform)
            )
        });
    }

    if (!account) {
        return { error: `No connected account found for platform: ${targetPlatform}` };
    }

    // 3. Format media items if they exist
    const mediaItems = platformOpts?.mediaUrls?.map((url: string) => ({
        type: "image", // Basic implementation, would need logic for video vs image
        url
    })) || [];

    if (!skipPreflight) {
        // Pre-flight: Mark as publishing to prevent double-execution
        await db.update(drafts)
            .set({ status: "publishing" })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
    }

    // 4. Call Zernio API with synchronous retries
    let lastError: any = null;
    let response: any = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            response = await zernio.posts.createPost({
                body: {
                    content: draft.content,
                    mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
                    platforms: [{
                        platform: account.platform,
                        accountId: account.platformAccountId
                    }]
                }
            });

            if (response.error) {
                throw response.error;
            }
            
            lastError = null;
            break;
        } catch (error: any) {
            lastError = error;
            const status = error?.status || error?.response?.status;
            
            if (status === 401 || status === 403) {
                await db.update(agentConfigs)
                    .set({ isPaused: true })
                    .where(eq(agentConfigs.tenantId, tenantId));
                break;
            }
            
            if (attempt < 3) {
                await delay(1000 * attempt);
            }
        }
    }

    if (lastError) {
        const errorMessage = lastError.message || (typeof lastError === 'string' ? lastError : "Failed to publish to social networks after retries.");
        
        await db.update(drafts)
            .set({ 
                status: "failed", 
                errorMessage 
            })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
            
        return { error: errorMessage };
    }

    // 5. Update database state within a transaction
    await db.transaction(async (tx) => {
        await tx.update(drafts)
            .set({ status: "published", errorMessage: null })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        await tx.insert(posts).values({
            tenantId,
            draftId: draft.id,
            zernioPostId: response?.data?.id || 'unknown',
            content: draft.content,
            status: "published",
        });
    });

        return { success: true };
    } catch (unexpectedError: any) {
        console.error("Unexpected error during publish:", unexpectedError);
        // Reset status to failed on unexpected errors (e.g. DB transaction failure)
        await db.update(drafts)
            .set({ status: "failed", errorMessage: unexpectedError.message || "An unexpected system error occurred." })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
            
        return { error: unexpectedError.message || "An unexpected system error occurred." };
    }
}

// Server Action for UI
export async function publishDraft(draftId: string) {
    try {
        const { zernio, tenantId } = await getZernioClient();
        return await executePublishDraft(draftId, tenantId, zernio);
    } catch (error: any) {
        console.error("Failed to publish draft:", error);
        return { error: error.message || "An unexpected error occurred." };
    }
}
