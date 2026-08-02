'use server';

import { db } from "@/lib/db";
import { drafts, posts, socialAccounts } from "@/lib/db/schema";
import { and, eq, gte, lte, isNotNull, inArray } from "drizzle-orm";
import { getZernioClient } from "./zernio";
import { getActiveTenantId } from "@/lib/auth";

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
        const accountMap = new Map(accounts.map(a => [a.id, a]));

        // 4. Batch fetch drafts for published posts to avoid N+1 query
        const postDraftIds = publishedPosts
            .map(p => p.draftId)
            .filter((id): id is string => id !== null);

        let draftMap = new Map();
        if (postDraftIds.length > 0) {
            const resolvedDrafts = await db.query.drafts.findMany({
                where: inArray(drafts.id, postDraftIds)
            });
            draftMap = new Map(resolvedDrafts.map(d => [d.id, d]));
        }

        const calendarEvents: CalendarPost[] = [];

        // Map drafts
        for (const draft of scheduledDrafts) {
            const opts = draft.platformOptions as any;
            const platform = opts?.platform || 'unknown';
            const accountId = opts?.accountId;
            const acc = accountId ? accountMap.get(accountId) : Array.from(accountMap.values()).find(a => a.platform === platform);
            
            if (draft.scheduledFor) {
                calendarEvents.push({
                    id: draft.id,
                    title: draft.content || "Draft variants pending review",
                    start: new Date(draft.scheduledFor),
                    end: new Date(draft.scheduledFor),
                    status: draft.status,
                    platform: acc ? acc.platform : platform,
                    mediaUrls: opts?.mediaUrls || [],
                    accountName: acc?.accountName || undefined,
                    avatarUrl: acc?.avatarUrl || undefined,
                });
            }
        }

        // Map posts
        for (const post of publishedPosts) {
            let platform = 'unknown';
            let mediaUrls: string[] = [];
            let accountId: string | undefined = undefined;
            
            if (post.draftId) {
                const draft = draftMap.get(post.draftId);
                if (draft) {
                    const opts = draft.platformOptions as any;
                    platform = opts?.platform || 'unknown';
                    mediaUrls = opts?.mediaUrls || [];
                    accountId = opts?.accountId;
                }
            }

            const acc = accountId ? accountMap.get(accountId) : Array.from(accountMap.values()).find(a => a.platform === platform);

            calendarEvents.push({
                id: post.id,
                title: post.content,
                start: new Date(post.publishedAt),
                end: new Date(post.publishedAt),
                status: post.status, // "published"
                platform: acc ? acc.platform : platform,
                mediaUrls,
                accountName: acc?.accountName || undefined,
                avatarUrl: acc?.avatarUrl || undefined,
            });
        }

        return { posts: calendarEvents };
    } catch (error: any) {
        console.error("Failed to fetch calendar posts:", error);
        return { error: "Failed to load calendar data" };
    }
}

/**
 * Reschedule an approved (or pending) scheduled draft by setting a new
 * scheduledFor time. Only edits drafts, not already-published posts.
 */
export async function rescheduleDraft(draftId: string, scheduledFor: Date) {
    try {
        const tenantId = await getActiveTenantId();

        const existing = await db.query.drafts.findFirst({
            where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)),
            columns: { scheduledFor: true, status: true },
        });

        if (!existing) return { error: "Draft not found" };
        if (!existing.scheduledFor) return { error: "Only scheduled drafts can be rescheduled." };

        await db.update(drafts)
            .set({ scheduledFor })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to reschedule draft:", error);
        return { error: "Failed to reschedule draft" };
    }
}
