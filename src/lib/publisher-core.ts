import { db } from "@/lib/db";
import { drafts, posts, socialAccounts, agentConfigs, apiKeys } from "@/lib/db/schema";
import { eq, and, inArray, isNotNull, lte } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
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
export async function executePublishDraft(draftId: string, tenantId: string, zernio: Zernio) {
    // 1. Atomically claim the draft for publishing
    const updateResult = await db.update(drafts)
        .set({ 
            status: "publishing",
            errorMessage: `claimed:${Date.now()}` 
        })
        .where(
            and(
                eq(drafts.id, draftId), 
                eq(drafts.tenantId, tenantId),
                inArray(drafts.status, ["approved", "failed"])
            )
        )
        .returning();

    if (updateResult.length === 0) {
        return { error: "Draft not found, not ready to publish, or already being published." };
    }
    
    const draft = updateResult[0];

    if (!draft.content) {
        // Should never happen if approval flow sets the content
        await db.update(drafts).set({ status: "failed", errorMessage: "Draft has no content to publish." }).where(eq(drafts.id, draftId));
        return { error: "Draft has no content to publish." };
    }

    // Type casting to ensure TypeScript knows it's a string from here on
    const postContent = draft.content as string;

    try {

    const platformOpts = draft.platformOptions as any;
    const targetPlatform = platformOpts?.platform;
    const targetAccountId = platformOpts?.accountId;

    // 2. Look up the corresponding Zernio account ID from socialAccounts
    const account = await db.query.socialAccounts.findFirst({
        where: and(
            eq(socialAccounts.tenantId, tenantId),
            targetAccountId
                ? eq(socialAccounts.id, targetAccountId)
                : eq(socialAccounts.platform, targetPlatform)
        )
    });

    if (!account) {
        // Revert status since we couldn't publish
        await db.update(drafts).set({ status: "failed", errorMessage: `No connected account found for platform: ${targetPlatform}` }).where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
        return { error: `No connected account found for platform: ${targetPlatform}` };
    }

    // 3. Format media items if they exist
    const mediaItems = platformOpts?.mediaUrls?.map((url: string) => ({
        type: "image", // Basic implementation, would need logic for video vs image
        url
    })) || [];

    // 4. Call Zernio API with synchronous retries
    let lastError: any = null;
    let response: any = null;
    const platformName = account.platform === 'x' ? 'twitter' : account.platform;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            response = await zernio.posts.createPost({
                headers: { "x-request-id": draftId },
                body: {
                    content: postContent,
                    mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
                    platforms: [{
                        platform: platformName,
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
            
            // Reconcile duplicate / in-flight post from Zernio 409 response
            if (status === 409) {
                const existingPostId = error?.existingPostId || error?.response?.data?.existingPostId || error?.data?.existingPostId;
                if (existingPostId) {
                    response = { data: { id: existingPostId } };
                    lastError = null;
                    break;
                }
            }
            
            if (status === 401 || status === 403) {
                await db.transaction(async (tx) => {
                    await tx.update(agentConfigs)
                        .set({ isPaused: true })
                        .where(eq(agentConfigs.tenantId, tenantId));
                        
                    await tx.update(drafts)
                        .set({ status: "failed", errorMessage: "API Connection Failure: Invalid or revoked API key." })
                        .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
                });
                
                try {
                    await createNotification(tenantId, 'api_failure', 'API Connection Failure', 'Your Zernio API key is invalid or revoked. Agent activity has been paused.', { link: '/settings' });
                } catch (notifErr) {
                    console.error("Failed to send api_failure notification", notifErr);
                }
                return { error: "API connection failed. Key is invalid or revoked." };
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
            
        try {
            await createNotification(tenantId, 'publish_failed', 'Post Failed to Publish', errorMessage, { link: '/drafts' });
        } catch (notifErr) {
            console.error("Failed to send publish_failed notification", notifErr);
        }
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
            content: postContent,
            status: "published",
        });
    });

        try {
            await createNotification(tenantId, 'publish_success', 'Post Published Successfully', 'Your post was successfully published to your connected accounts.');
        } catch (notifErr) {
            console.error("Failed to send publish_success notification", notifErr);
        }
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

/**
 * Recovers drafts stranded in 'publishing' state due to interrupted worker execution
 * or network timeouts. Resets scheduled drafts back to 'approved' for retry, or 'failed'
 * for manual drafts.
 */
export async function recoverStalePublishingDrafts(staleAfterMs = 5 * 60 * 1000): Promise<number> {
    const now = Date.now();
    const staleCutoffDate = new Date(now - staleAfterMs);

    const stranded = await db.select({
        id: drafts.id,
        tenantId: drafts.tenantId,
        errorMessage: drafts.errorMessage,
        scheduledFor: drafts.scheduledFor,
        createdAt: drafts.createdAt,
    })
    .from(drafts)
    .where(eq(drafts.status, "publishing"));

    let recoveredCount = 0;
    for (const d of stranded) {
        let isStale = false;
        if (d.errorMessage?.startsWith("claimed:")) {
            const timestamp = parseInt(d.errorMessage.split(":")[1], 10);
            if (!isNaN(timestamp) && now - timestamp >= staleAfterMs) {
                isStale = true;
            }
        } else if (d.scheduledFor && d.scheduledFor < staleCutoffDate) {
            isStale = true;
        } else if (d.createdAt < staleCutoffDate) {
            isStale = true;
        }

        if (isStale) {
            await db.update(drafts)
                .set({
                    status: d.scheduledFor ? "approved" : "failed",
                    errorMessage: "Publishing timed out or was interrupted; recovered for retry.",
                })
                .where(and(eq(drafts.id, d.id), eq(drafts.status, "publishing")));
            recoveredCount++;
        }
    }

    return recoveredCount;
}

/**
 * Publishes approved drafts scheduled for now or in the past with batch bounds.
 * Automatically recovers stranded publishing claims before executing due drafts.
 */
export async function publishDueDrafts(options: { limit?: number; staleAfterMs?: number } = {}): Promise<{ published: number; failed: number; recovered: number }> {
    const recovered = await recoverStalePublishingDrafts(options.staleAfterMs);
    const now = new Date();
    const batchLimit = options.limit ?? 10;

    const pendingDrafts = await db.select({
        id: drafts.id,
        tenantId: drafts.tenantId
    })
    .from(drafts)
    .where(
        and(
            eq(drafts.status, "approved"),
            isNotNull(drafts.scheduledFor),
            lte(drafts.scheduledFor, now)
        )
    )
    .limit(batchLimit);

    let published = 0;
    let failed = 0;

    for (const draft of pendingDrafts) {
        try {
            const { zernio } = await getZernioClientForTenant(draft.tenantId);
            const res = await executePublishDraft(draft.id, draft.tenantId, zernio);
            if (res.success) {
                published++;
            } else {
                failed++;
            }
        } catch (error) {
            console.error(`Failed to publish scheduled draft ${draft.id} for tenant ${draft.tenantId}:`, error);
            failed++;
        }
    }

    return { published, failed, recovered };
}
