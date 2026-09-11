import { db } from "@/lib/db";
import { drafts, posts, socialAccounts, agentConfigs, apiKeys } from "@/lib/db/schema";
import { eq, and, or, inArray, isNotNull, isNull, lte, asc, sql } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
import { decrypt } from "@/lib/crypto";
import Zernio from "@zernio/node";

export function draftStatusFromZernio(status: string | undefined): "published" | "publishing" | "failed" {
    if (status === "published") return "published";
    if (status === "publishing" || status === "scheduled" || status === "pending") return "publishing";
    return "failed";
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Internal helper for background cron jobs to get Zernio client without an HTTP session
export async function getZernioClientForTenant(tenantId: string) {
    const key = await db.query.apiKeys.findFirst({
        where: and(
            eq(apiKeys.tenantId, tenantId),
            eq(apiKeys.provider, 'zernio'),
            eq(apiKeys.status, 'active'),
        ),
    });

    if (!key || !key.encryptedKey) {
        throw new Error("No API key configured for this tenant");
    }

    const apiKey = decrypt(key.encryptedKey, tenantId);
    return { zernio: new Zernio({ apiKey }), tenantId };
}

// Reusable core logic for publishing a draft
export async function executePublishDraft(draftId: string, tenantId: string, zernio: Zernio, publishEarly = false) {
    // 0. Idempotency check: reconcile if this draft was already recorded in posts
    const alreadyPublished = await db.query.posts.findFirst({
        where: and(eq(posts.tenantId, tenantId), eq(posts.draftId, draftId))
    });
    if (alreadyPublished) {
        if (alreadyPublished.status !== "published" && alreadyPublished.zernioPostId) {
            return db.transaction(async (tx) => {
            await tx.execute(sql`SELECT id FROM ${drafts} WHERE id = ${draftId} AND tenant_id = ${tenantId} FOR UPDATE`);
            const existing = await zernio.posts.getPost({ path: { postId: alreadyPublished.zernioPostId } });
            if (existing.error || !existing.data?.post) return { error: "Couldn’t confirm the existing post. Please try again later." };
            const status = draftStatusFromZernio(existing.data.post.status);
            await tx.update(posts).set({ status, ...(status === "published" ? { publishedAt: new Date() } : {}) }).where(eq(posts.id, alreadyPublished.id));
            await tx.update(drafts).set({ status, errorMessage: status === "failed" ? "Zernio reported a publishing failure. Review the post in Zernio before retrying." : null })
                .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
            return status === "failed" ? { error: "Zernio reported a publishing failure." } : { success: true, status };
            });
        }
        await db.update(drafts).set({ status: alreadyPublished.status, errorMessage: null })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
        return { success: true, status: alreadyPublished.status };
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
                or(isNull(drafts.errorMessage), sql`${drafts.errorMessage} NOT LIKE 'verify:%'`),
                or(
                    inArray(drafts.status, ["approved", "failed"]),
                    and(eq(drafts.status, "scheduled"), publishEarly ? undefined : lte(drafts.scheduledFor, new Date()))
                )
            )
        )
        .returning();

    if (updateResult.length === 0) {
        return { error: "Draft not found, not ready to publish, or already being published." };
    }
    
    const draft = updateResult[0];

    const attachedMedia = (draft.platformOptions as { mediaUrls?: string[] } | null)?.mediaUrls;
    if (!draft.content?.trim() && !attachedMedia?.length) {
        // Should never happen if approval flow sets the content
        await db.update(drafts).set({ status: "failed", errorMessage: "Draft has no content to publish." }).where(eq(drafts.id, draftId));
        return { error: "Draft has no content to publish." };
    }

    // Type casting to ensure TypeScript knows it's a string from here on
    const postContent = draft.content || "";

    try {

    const platformOpts = draft.platformOptions as any;
    const targetPlatform = platformOpts?.platform;
    const targetAccountId = platformOpts?.accountId || (platformOpts?.accountIds?.length === 1 ? platformOpts.accountIds[0] : undefined);
    if (platformOpts?.accountIds?.length > 1) throw new Error("This legacy draft has multiple targets. Use Compose to create one draft per account.");

    // 2. Look up the corresponding Zernio account ID from socialAccounts
    const matchingAccounts = await db.query.socialAccounts.findMany({
        where: and(
            eq(socialAccounts.tenantId, tenantId),
            eq(socialAccounts.isActive, true),
            targetAccountId
                ? eq(socialAccounts.id, targetAccountId)
                : inArray(socialAccounts.platform, ["x", "twitter"].includes(targetPlatform) ? ["x", "twitter"] : [targetPlatform])
        )
    });

    if (matchingAccounts.length > 1) throw new Error("Multiple accounts match this draft. Choose one account in Compose.");
    const account = matchingAccounts[0];

    if (!account) {
        // Revert status since we couldn't publish
        await db.update(drafts).set({ status: "failed", errorMessage: `No connected account found for platform: ${targetPlatform}` }).where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
        return { error: `No connected account found for platform: ${targetPlatform}` };
    }

    // 3. Format media items if they exist
    const isVideo = (url: string) => /\.(mp4|mov|webm|m4v|mkv|avi)(\?.*)?$/i.test(url);
    const mediaItems = platformOpts?.mediaUrls?.map((url: string) => ({
        type: isVideo(url) ? "video" : "image",
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
                    publishNow: true,
                    mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
                    platforms: [{
                        platform: platformName,
                        accountId: account.platformAccountId
                    }],
                    metadata: { draftId }
                }
            });

            if (response.error) {
                const detail = response.error;
                throw Object.assign(new Error(detail.error || detail.message || "Zernio rejected the post"), detail, {
                    status: response.response?.status || detail.status || detail.statusCode,
                });
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
                    const existing = await zernio.posts.getPost({ path: { postId: existingPostId } });
                    if (!existing.error && existing.data?.post) {
                        response = existing;
                        lastError = null;
                        break;
                    }
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
            
            if (status && status < 500 && status !== 408 && status !== 429) break;
            if (attempt < 3) {
                await delay(1000 * attempt);
            }
        }
    }

    if (lastError) {
        const remoteStatus = lastError?.statusCode || lastError?.status || lastError?.response?.status;
        const uncertain = !remoteStatus || remoteStatus >= 500 || remoteStatus === 408 || remoteStatus === 409;
        const errorMessage = uncertain
            ? "verify: Publication could not be confirmed. Check the existing post in Zernio before creating another post."
            : lastError.message || "Zernio rejected the post.";
        
        await db.update(drafts)
            .set({ 
                status: "failed", 
                errorMessage 
            })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId), eq(drafts.errorMessage, draft.errorMessage!)));
            
        try {
            await createNotification(tenantId, 'publish_failed', 'Post Failed to Publish', errorMessage, { link: '/drafts' });
        } catch (notifErr) {
            console.error("Failed to send publish_failed notification", notifErr);
        }
        return { error: errorMessage };
    }

    const remotePost = response?.data?.post || response?.data?.existingPost;
    if (!remotePost?._id) throw new Error("verify: Zernio did not return a post identifier. Check Zernio before creating another post.");
    const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM ${drafts} WHERE id = ${draftId} AND tenant_id = ${tenantId} FOR UPDATE`);
        const current = await tx.query.drafts.findFirst({ where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)) });
        // A webhook can finish before createPost returns. Preserve its canonical
        // result instead of replacing it with the older HTTP response.
        const reconciled = current && current.errorMessage !== draft.errorMessage && !current.errorMessage?.startsWith("verify:");
        const status = reconciled ? draftStatusFromZernio(current.status) : draftStatusFromZernio(remotePost.status);
        const errorMessage = status === "failed" ? (reconciled && current.errorMessage) || "Zernio did not publish the post. Check its status before retrying." : null;
        await tx.update(drafts).set({ status, errorMessage })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
        const recorded = await tx.query.posts.findFirst({ where: and(eq(posts.draftId, draftId), eq(posts.tenantId, tenantId)) });
        if (recorded) {
            await tx.update(posts).set({ status }).where(eq(posts.id, recorded.id));
        } else {
            await tx.insert(posts).values({ tenantId, draftId: draft.id, zernioPostId: remotePost._id, content: postContent, status });
        }
        return { status, errorMessage };
    });
    const { status, errorMessage } = result;
    if (status === "failed") return { error: errorMessage! };
    if (status === "published") {
        try {
            await createNotification(tenantId, 'publish_success', 'Post published', 'Your post was published to your connected account.');
        } catch (notifErr) { console.error("Failed to send publish notification", notifErr); }
    }
    return { success: true, status };
    } catch (unexpectedError: any) {
        console.error("Unexpected error during publish:", unexpectedError);
        // Reset status to failed on unexpected errors (e.g. DB transaction failure)
        await db.update(drafts)
            .set({ status: "failed", errorMessage: unexpectedError.message || "An unexpected system error occurred." })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId), eq(drafts.errorMessage, draft.errorMessage!)));
            
        return { error: unexpectedError.message || "An unexpected system error occurred." };
    }
}

/**
 * Recovers a bounded batch of interrupted publishing claims. Existing remote
 * posts retain their recorded status. Unknown outcomes require verification;
 * resetting a claim for a later retry could cross Zernio's idempotency window.
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
                .set({ status: recorded.status, errorMessage: null })
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

        // A reset followed by a later worker run can cross the provider window.
        // Without a durable remote ID, require reconciliation rather than resubmit.
        await db.update(drafts).set({
            status: "failed",
            errorMessage: "verify: Publishing was interrupted. Check Zernio before creating another post.",
        }).where(and(eq(drafts.id, d.id), eq(drafts.status, "publishing")));
        recoveredCount++;

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
            inArray(drafts.status, ["approved", "scheduled"]),
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
                    inArray(drafts.status, ["approved", "scheduled"]),
                ));
            failed++;
        }
    }

    return { published, failed, recovered };
}
