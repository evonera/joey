'use server';

import { db } from "@/lib/db";
import { drafts, posts, socialAccounts, agentConfigs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getZernioClient } from "./zernio";

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function publishDraft(draftId: string) {
    try {
        const { zernio, tenantId } = await getZernioClient();
        
        // 1. Fetch the draft
        const draft = await db.query.drafts.findFirst({
            where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId))
        });

        if (!draft || draft.status !== "approved") {
            return { error: "Draft not found or not approved." };
        }

        const platformOpts = draft.platformOptions as any;
        const targetPlatform = platformOpts?.platform;

        // 2. Look up the corresponding Zernio account ID from socialAccounts
        const account = await db.query.socialAccounts.findFirst({
            where: and(
                eq(socialAccounts.tenantId, tenantId),
                eq(socialAccounts.platform, targetPlatform)
            )
        });

        if (!account) {
            return { error: `No connected account found for platform: ${targetPlatform}` };
        }

        // 3. Format media items if they exist
        const mediaItems = platformOpts?.mediaUrls?.map((url: string) => ({
            type: "image", // Basic implementation, would need logic for video vs image
            url
        })) || [];

        // Pre-flight: Mark as publishing to prevent double-execution
        await db.update(drafts)
            .set({ status: "publishing" })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

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

                // Zernio uses @hey-api/client-fetch which returns { data, error, response }
                if (response.error) {
                    throw response.error;
                }
                
                // If we get here, it succeeded
                lastError = null;
                break;
            } catch (error: any) {
                lastError = error;
                const status = error?.status || error?.response?.status;
                
                if (status === 401 || status === 403) {
                    // Hard error: API Key revoked or expired. Do not retry.
                    await db.update(agentConfigs)
                        .set({ isPaused: true })
                        .where(eq(agentConfigs.tenantId, tenantId));
                    break;
                }
                
                if (attempt < 3) {
                    await delay(1000 * attempt); // simple backoff 1s, 2s
                }
            }
        }

        if (lastError) {
            const errorMessage = lastError.message || typeof lastError === 'string' ? lastError : "Failed to publish to social networks after retries.";
            
            // Mark draft as failed
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
            // Mark draft as published
            await tx.update(drafts)
                .set({ status: "published", errorMessage: null })
                .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

            // Create post record
            await tx.insert(posts).values({
                tenantId,
                draftId: draft.id,
                zernioPostId: response?.data?.id || 'unknown', // Assuming Zernio returns an ID
                content: draft.content,
                status: "published",
            });
        });

        return { success: true };
    } catch (error: any) {
        console.error("Failed to publish draft:", error);
        return { error: error.message || "An unexpected error occurred." };
    }
}
