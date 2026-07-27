'use server';

import { db } from "@/lib/db";
import { drafts, posts, socialAccounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getZernioClient } from "./zernio";

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

        // 4. Call Zernio API
        const response = await zernio.posts.createPost({
            body: {
                content: draft.content,
                mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
                platforms: [{
                    platform: account.platform,
                    accountId: account.platformAccountId
                }]
            }
        });

        // 5. Update database state within a transaction
        await db.transaction(async (tx) => {
            // Mark draft as published
            await tx.update(drafts)
                .set({ status: "published" })
                .where(eq(drafts.id, draftId));

            // Create post record
            await tx.insert(posts).values({
                tenantId,
                draftId: draft.id,
                zernioPostId: response.data?.id, // Assuming Zernio returns an ID
                content: draft.content,
                status: "published",
            });
        });

        return { success: true };
    } catch (error: any) {
        console.error("Failed to publish draft:", error);
        return { error: error.message || "Failed to publish to social networks." };
    }
}
