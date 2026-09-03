import { db } from "@/lib/db";
import { drafts, posts, socialAccounts, agentConfigs, apiKeys } from "@/lib/db/schema";
import { eq, and, or, inArray, isNotNull, isNull, lte, asc, sql } from "drizzle-orm";
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

    const apiKey = decrypt(key.encryptedKey, tenantId);
    return { zernio: new Zernio({ apiKey }), tenantId };
}

// Reusable core logic for publishing a draft
export async function executePublishDraft(draftId: string, tenantId: string, zernio: Zernio) {
    // 0. Idempotency check: reconcile if this draft was already recorded in posts
    const alreadyPublished = await db.query.posts.findFirst({
        where: and(eq(posts.tenantId, tenantId), eq(posts.draftId, draftId))
    });
    if (alreadyPublished) {
        await db.update(drafts)
            .set({ status: "published", errorMessage: null })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
        return { success: true };
    }

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
                    }],
                    metadata: { draftId }
                }
            });

            if (response.error) {
                throw response.error;
            }
            
            lastError = null;
            break;
        } catch (error: any) {
            lastError = error;
            const status = error?.statusCode || error?.status || error?.response?.status;
            
            // Reconcile duplicate / in-flight post from Zernio 409 response
            if (status === 409) {
                const existingPostId = 
                    error?.details?.existingPostId || 
                    error?.existingPostId || 
                    error?.response?.data?.details?.existingPostId ||
                    error?.response?.data?.existingPostId || 
                    error?.data?.details?.existingPostId ||
                    error?.data?.existingPostId;
                if (existingPostId) {
                    response = { data: { id: existingPostId } };
                    lastError = null;
                    break;
                }
            }
            
            if (status === 401 || status === 403) {
                await db.transaction(async (tx) => {
                    await tx.update(agentConfigs)
                        .set({ isPaused: true, pauseReason: "api_failure" })
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

        const zernioPostId = 
            response?.data?.id || 
            response?.data?.existingPost?.id || 
            response?.data?.existingPostId || 
            'unknown';

        await tx.insert(posts).values({
            tenantId,
            draftId: draft.id,
            zernioPostId,
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
 * Maximum elapsed time allowed before an interrupted claim can no longer safely
 * rely on Zernio's ~5-minute same-request idempotency window (x-request-id).
 */
const MAX_SAFE_IDEMPOTENCY_WINDOW_MS = 4 * 60 * 1000;

/**
 * Recovers drafts stranded in 'publishing' state due to interrupted worker execution
 * or network timeouts with strict batch bounding and safe idempotency windows.
 * 
 * Safety guarantees:
 * 1. Bounded: Restricts processing to at most `limit` stranded drafts per invocation.
 * 2. Non-blocking: Avoids sequential external network calls in the recovery loop so the cron
 *    route runtime budget is preserved for due-draft publishing.
 * 3. Exact matching: Checks local `posts` table by exact `draftId`. Never uses ambiguous content matching.
 * 4. Window enforcement:
 *    - If claimed within MAX_SAFE_IDEMPOTENCY_WINDOW_MS (< 4 min): safely resets to 'approved' for retry
 *      guaranteed by Zernio's ~5-minute x-request-id idempotency key.
 *    - If claimed >= MAX_SAFE_IDEMPOTENCY_WINDOW_MS (>= 4 min): marks as 'failed' to prevent duplicate
 *      social posts from being created beyond the deduplication window.
 */
export async function recoverStalePublishingDrafts(options: { limit?: number; staleAfterMs?: number } = {}): Promise<number> {
    const now = Date.now();
    const staleAfterMs = options.staleAfterMs ?? 2 * 60 * 1000;
    const staleCutoffDate = new Date(now - staleAfterMs);
    const staleCutoffTimestamp = now - staleAfterMs;
    const staleClaimBound = `claimed:${staleCutoffTimestamp}`;
    const batchLimit = options.limit ?? 10;

    const stranded = await db.select({
        id: drafts.id,
        tenantId: drafts.tenantId,
        content: drafts.content,
        errorMessage: drafts.errorMessage,
        scheduledFor: drafts.scheduledFor,
        createdAt: drafts.createdAt,
    })
    .from(drafts)
    .where(
        and(
            eq(drafts.status, "publishing"),
            or(
                // Claimed with a timestamp at or older than stale cutoff
                and(
                    sql`${drafts.errorMessage} LIKE 'claimed:%'`,
                    sql`${drafts.errorMessage} <= ${staleClaimBound}`
                ),
                // Or legacy/unmarked claim whose scheduledFor or createdAt has expired
                and(
                    or(
                        isNull(drafts.errorMessage),
                        sql`${drafts.errorMessage} NOT LIKE 'claimed:%'`
                    ),
                    or(
                        lte(drafts.scheduledFor, staleCutoffDate),
                        lte(drafts.createdAt, staleCutoffDate)
                    )
                )
            )
        )
    )
    .orderBy(asc(drafts.createdAt))
    .limit(batchLimit);

    let recoveredCount = 0;
    for (const d of stranded) {
        // 1. Check if the draft was already recorded in posts table
        const recorded = await db.query.posts.findFirst({
            where: and(eq(posts.tenantId, d.tenantId), eq(posts.draftId, d.id))
        });
        if (recorded) {
            await db.update(drafts)
                .set({ status: "published", errorMessage: null })
                .where(and(eq(drafts.id, d.id), eq(drafts.tenantId, d.tenantId)));
            recoveredCount++;
            continue;
        }

        let claimTimestamp = 0;
        if (d.errorMessage?.startsWith("claimed:")) {
            claimTimestamp = parseInt(d.errorMessage.split(":")[1], 10);
        }

        const isStale = (claimTimestamp > 0 && now - claimTimestamp >= staleAfterMs) ||
            (!claimTimestamp && d.scheduledFor && d.scheduledFor < staleCutoffDate) ||
            (!claimTimestamp && d.createdAt < staleCutoffDate);

        if (!isStale) continue;

        const claimAgeMs = claimTimestamp > 0 
            ? (now - claimTimestamp) 
            : (now - (d.scheduledFor?.getTime() || d.createdAt.getTime()));

        if (claimAgeMs < MAX_SAFE_IDEMPOTENCY_WINDOW_MS) {
            // Within safe 5-minute idempotency window: safe to retry via x-request-id
            await db.update(drafts)
                .set({
                    status: d.scheduledFor ? "approved" : "failed",
                    errorMessage: "Publishing timed out or was interrupted; recovered for retry.",
                })
                .where(and(eq(drafts.id, d.id), eq(drafts.status, "publishing")));
            recoveredCount++;
        } else {
            // Exceeds safe 5-minute idempotency window: mark as failed to prevent duplicate publishing
            // and avoid external network calls that could exhaust the route's runtime budget.
            await db.update(drafts)
                .set({
                    status: "failed",
                    errorMessage: "Publishing claim timed out beyond the 5-minute deduplication window. Marked failed to prevent duplicate publishing; verify your social feeds before retrying.",
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
    const batchLimit = options.limit ?? 10;
    const recovered = await recoverStalePublishingDrafts({ 
        limit: batchLimit, 
        staleAfterMs: options.staleAfterMs 
    });
    const now = new Date();

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
        } catch (error: any) {
            console.error(`Failed to publish scheduled draft ${draft.id} for tenant ${draft.tenantId}:`, error);
            await db.update(drafts)
                .set({
                    status: "failed",
                    errorMessage: error?.message || "Failed to initialize publisher client",
                })
                .where(and(
                    eq(drafts.id, draft.id),
                    eq(drafts.tenantId, draft.tenantId),
                    eq(drafts.status, "approved"),
                ));
            failed++;
        }
    }

    return { published, failed, recovered };
}
