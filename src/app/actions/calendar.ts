'use server';

import { db } from "@/lib/db";
import { drafts, posts, socialAccounts } from "@/lib/db/schema";
import { and, eq, gte, lte, isNotNull } from "drizzle-orm";
import { getZernioClient } from "./zernio";

export type CalendarPost = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  platform: string;
  mediaUrls: string[];
  accountName?: string;
  avatarUrl?: string;
};

export async function getCalendarPosts(startDate: Date, endDate: Date) {
    try {
        const { tenantId } = await getZernioClient();
        
        // 1. Fetch scheduled drafts
        const scheduledDrafts = await db.query.drafts.findMany({
            where: and(
                eq(drafts.tenantId, tenantId),
                isNotNull(drafts.scheduledFor),
                gte(drafts.scheduledFor, startDate),
                lte(drafts.scheduledFor, endDate)
            )
        });

        // 2. Fetch published posts
        const publishedPosts = await db.query.posts.findMany({
            where: and(
                eq(posts.tenantId, tenantId),
                gte(posts.publishedAt, startDate),
                lte(posts.publishedAt, endDate)
            )
        });

        // 3. Fetch social accounts for mapping
        const accounts = await db.query.socialAccounts.findMany({
            where: eq(socialAccounts.tenantId, tenantId)
        });
        const accountMap = new Map(accounts.map(a => [a.platform, a]));

        const calendarEvents: CalendarPost[] = [];

        // Map drafts
        for (const draft of scheduledDrafts) {
            const opts = draft.platformOptions as any;
            const platform = opts?.platform || 'unknown';
            const acc = accountMap.get(platform);
            
            if (draft.scheduledFor) {
                calendarEvents.push({
                    id: draft.id,
                    title: draft.content,
                    start: new Date(draft.scheduledFor),
                    end: new Date(draft.scheduledFor),
                    status: draft.status,
                    platform,
                    mediaUrls: opts?.mediaUrls || [],
                    accountName: acc?.accountName,
                    avatarUrl: acc?.avatarUrl || undefined,
                });
            }
        }

        // Map posts
        for (const post of publishedPosts) {
            // For posts, we might need to look up the draft to get platform opts, 
            // or if we store platform on the post, use that.
            // Currently our posts table doesn't have a platform column, 
            // but we can join with drafts or just assume we'll fix it later.
            // Let's fetch the draft for this post to get its platform options.
            let platform = 'unknown';
            let mediaUrls: string[] = [];
            
            if (post.draftId) {
                const draft = await db.query.drafts.findFirst({ where: eq(drafts.id, post.draftId) });
                if (draft) {
                    const opts = draft.platformOptions as any;
                    platform = opts?.platform || 'unknown';
                    mediaUrls = opts?.mediaUrls || [];
                }
            }

            const acc = accountMap.get(platform);

            calendarEvents.push({
                id: post.id,
                title: post.content,
                start: new Date(post.publishedAt),
                end: new Date(post.publishedAt),
                status: post.status, // "published"
                platform,
                mediaUrls,
                accountName: acc?.accountName,
                avatarUrl: acc?.avatarUrl || undefined,
            });
        }

        return { posts: calendarEvents };
    } catch (error: any) {
        console.error("Failed to fetch calendar posts:", error);
        return { error: "Failed to load calendar data" };
    }
}
