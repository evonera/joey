'use server';

import { db } from "@/lib/db";
import { drafts, posts, socialAccounts, contentPackages, themeContentFormats } from "@/lib/db/schema";
import { and, eq, gte, lte, isNotNull, inArray, or, sql, isNull } from "drizzle-orm";
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
  canReschedule?: boolean;
  editUrl?: string;
  source?: "draft" | "theme";
};

export async function getCalendarPosts(startDate: Date, endDate: Date) {
    try {
        const tenantId = await getActiveTenantId();
        
        if (!(startDate instanceof Date) || !(endDate instanceof Date) || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate || endDate.getTime() - startDate.getTime() > 366 * 86_400_000) return { error: "Choose a valid calendar range of up to one year." };
        const [scheduledDrafts, publishedPosts, accounts, packages, formats] = await Promise.all([
            db.query.drafts.findMany({
                where: and(eq(drafts.tenantId, tenantId), isNotNull(drafts.scheduledFor), gte(drafts.scheduledFor, startDate), lte(drafts.scheduledFor, endDate), inArray(drafts.status, ["draft", "pending_review", "approved", "scheduled", "publishing", "failed"])),
            }),
            db.query.posts.findMany({
                where: and(eq(posts.tenantId, tenantId), eq(posts.status, "published"), gte(posts.publishedAt, startDate), lte(posts.publishedAt, endDate)),
            }),
            db.query.socialAccounts.findMany({ where: eq(socialAccounts.tenantId, tenantId) }),
            db.query.contentPackages.findMany({ where: and(eq(contentPackages.tenantId, tenantId), or(
                and(eq(contentPackages.status, "published"), gte(contentPackages.publishedAt, startDate), lte(contentPackages.publishedAt, endDate)),
                and(inArray(contentPackages.status, ["pending_review", "approved", "publishing", "failed"]), gte(contentPackages.scheduledFor, startDate), lte(contentPackages.scheduledFor, endDate)),
            )) }),
            db.query.themeContentFormats.findMany({ where: eq(themeContentFormats.tenantId, tenantId), columns: { id: true, platform: true } }),
        ]);
        const accountMap = new Map(accounts.map(a => [a.id, a]));

        // 4. Batch fetch drafts for published posts to avoid N+1 query
        const postDraftIds = publishedPosts
            .map(p => p.draftId)
            .filter((id): id is string => id !== null);

        let draftMap = new Map();
        if (postDraftIds.length > 0) {
            const resolvedDrafts = await db.query.drafts.findMany({
                where: and(eq(drafts.tenantId, tenantId), inArray(drafts.id, postDraftIds))
            });
            draftMap = new Map(resolvedDrafts.map(d => [d.id, d]));
        }

        const calendarEvents: CalendarPost[] = [];

        const publishedDraftIds = new Set(postDraftIds);
        // Map drafts
        for (const draft of scheduledDrafts) {
            if (publishedDraftIds.has(draft.id)) continue;
            const opts = draft.platformOptions as any;
            const platform = opts?.platform || 'unknown';
            const accountId = opts?.accountId;
            const acc = accountId ? accountMap.get(accountId) : Array.from(accountMap.values()).find(a => a.platform === platform);
            
            if (draft.scheduledFor) {
                calendarEvents.push({
                    id: draft.id,
                    source: "draft",
                    canReschedule: ["draft", "pending_review", "approved", "scheduled"].includes(draft.status),
                    editUrl: `/compose?draftId=${draft.id}`,
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
                source: "draft",
                canReschedule: false,
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

        const formatMap = new Map(formats.map(row => [row.id, row.platform]));
        for (const pkg of packages) {
            const date = pkg.status === "published" ? pkg.publishedAt : pkg.scheduledFor;
            if (!date) continue;
            const media = Array.isArray(pkg.renderedAssetUrls) ? pkg.renderedAssetUrls : [];
            calendarEvents.push({ id: pkg.id, source: "theme", canReschedule: false, editUrl: `/theme-studio/${pkg.themePageId}`,
                title: pkg.title, start: date, end: date, status: pkg.status, platform: formatMap.get(pkg.formatId) || "unknown",
                mediaUrls: media.map(item => typeof item === "string" ? item : item && typeof item === "object" && "url" in item ? item.url : undefined).filter((url): url is string => typeof url === "string"),
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

        if (!(scheduledFor instanceof Date) || !Number.isFinite(scheduledFor.getTime()) || scheduledFor <= new Date()) return { error: "Choose a future date and time." };
        const changed = await db.update(drafts)
            .set({ scheduledFor })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId), isNotNull(drafts.scheduledFor),
                inArray(drafts.status, ["draft", "pending_review", "approved", "scheduled"]),
                or(isNull(drafts.errorMessage), sql`${drafts.errorMessage} NOT LIKE 'verify:%'`)))
            .returning({ id: drafts.id });
        if (!changed.length) return { error: "This draft cannot be rescheduled. It may already be publishing; refresh the calendar." };

        return { success: true };
    } catch (error: any) {
        console.error("Failed to reschedule draft:", error);
        return { error: "Failed to reschedule draft" };
    }
}
