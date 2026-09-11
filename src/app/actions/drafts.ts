'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { drafts, contentPackages, themePages, tenants } from "@/lib/db/schema";
import { eq, and, or, isNotNull, isNull, inArray, desc, ilike, sql } from "drizzle-orm";
import { reviewThemePackage } from "@/app/actions/theme-packages";

// A review action must never reset an accepted or uncertain publication.
function editableDraft() {
    return and(inArray(drafts.status, ["draft", "pending_review", "approved", "scheduled", "rejected", "failed"]),
        or(isNull(drafts.errorMessage), sql`${drafts.errorMessage} NOT LIKE 'verify:%'`),
        sql`NOT EXISTS (SELECT 1 FROM posts p WHERE p.draft_id = ${drafts.id} AND p.tenant_id = ${drafts.tenantId})`);
}
function editablePackage() {
    return and(inArray(contentPackages.status, ["pending_review", "approved", "rejected", "failed"]),
        sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`, sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`);
}

function extractMediaUrls(renderedAssetUrls: unknown): string[] {
    if (!Array.isArray(renderedAssetUrls)) return [];
    return renderedAssetUrls.map(item => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "url" in item && typeof item.url === "string") return item.url;
        return null;
    }).filter((u): u is string => Boolean(u));
}

export async function getDrafts(status?: string, platform?: string, search?: string, source?: string) {
    try {
        const tenantId = await getActiveTenantId();
        const promises: [Promise<any[]>, Promise<any[]>, Promise<any[]>] = [
            // 1. Standard drafts
            source === "theme_studio"
                ? Promise.resolve([])
                : (async () => {
                    let conditions = [eq(drafts.tenantId, tenantId)];
                    if (status && status !== "all") {
                        if (status === "scheduled") {
                            conditions.push(
                                or(
                                    eq(drafts.status, "scheduled"),
                                    and(eq(drafts.status, "approved"), isNotNull(drafts.scheduledFor))
                                )!
                            );
                        } else if (status === "approved") {
                            conditions.push(
                                and(
                                    eq(drafts.status, "approved"),
                                    isNull(drafts.scheduledFor)
                                )!
                            );
                        } else {
                            conditions.push(eq(drafts.status, status));
                        }
                    }
                    if (search && search.trim()) {
                        conditions.push(ilike(drafts.content, `%${search.trim()}%`));
                    }
                    return await db.query.drafts.findMany({
                        where: and(...conditions),
                        orderBy: [desc(drafts.createdAt)]
                    });
                })(),

            // 2. Theme Studio content packages
            source === "compose" || source === "flows"
                ? Promise.resolve([])
                : (async () => {
                    let conditions = [eq(contentPackages.tenantId, tenantId)];
                    if (status && status !== "all") {
                        if (status === "scheduled") {
                            conditions.push(
                                and(
                                    eq(contentPackages.status, "approved"),
                                    isNotNull(contentPackages.scheduledFor)
                                )!
                            );
                        } else if (status === "approved") {
                            conditions.push(
                                and(eq(contentPackages.status, "approved"), isNull(contentPackages.scheduledFor))!
                            );
                        } else if (status === "publishing") {
                            conditions.push(eq(contentPackages.status, "publishing"));
                        } else if (status === "pending_review") {
                            conditions.push(eq(contentPackages.status, "pending_review"));
                        } else if (status === "rejected") {
                            conditions.push(eq(contentPackages.status, "rejected"));
                        } else if (status === "published") {
                            conditions.push(eq(contentPackages.status, "published"));
                        } else if (status === "failed") {
                            conditions.push(eq(contentPackages.status, "failed"));
                        }
                    }
                    if (search && search.trim()) {
                        conditions.push(
                            or(
                                ilike(contentPackages.title, `%${search.trim()}%`),
                                ilike(contentPackages.caption, `%${search.trim()}%`)
                            )!
                        );
                    }
                    return await db.query.contentPackages.findMany({
                        where: and(...conditions),
                        orderBy: [desc(contentPackages.createdAt)]
                    });
                })(),

            // 3. Theme pages for lookup
            db.query.themePages.findMany({
                where: eq(themePages.tenantId, tenantId),
                columns: { id: true, name: true }
            })
        ];

        const [draftRows, packageRows, themePageRows] = await Promise.all(promises);

        const themePagesMap = new Map<string, string>();
        for (const tp of themePageRows) {
            themePagesMap.set(tp.id, tp.name);
        }

        // Map standard drafts
        const normalizedDrafts = draftRows.map(d => {
            const opts = (d.platformOptions as any) || {};
            const isFlow = Boolean(opts.flowRunId);
            return {
                ...d,
                platformOptions: {
                    ...opts,
                    source: isFlow ? "flows" : opts.source || "compose",
                }
            };
        });

        // Map theme studio packages to match DraftCard interface
        const normalizedPackages = packageRows.map(pkg => {
            const pageName = themePagesMap.get(pkg.themePageId) || "Theme Channel";
            const media = extractMediaUrls(pkg.renderedAssetUrls);
            const content = pkg.caption
                ? `${pkg.title}\n\n${pkg.caption}`
                : pkg.title;

            return {
                id: pkg.id,
                tenantId: pkg.tenantId,
                content,
                variants: null,
                selectedVariantId: null,
                status: pkg.status,
                platformOptions: {
                    platform: "Theme Channel",
                    mediaUrls: media,
                    isThemePackage: true,
                    themePageId: pkg.themePageId,
                    themePageName: pageName,
                    source: "theme_studio",
                    title: pkg.title,
                    caption: pkg.caption,
                    hashtags: pkg.hashtags || [],
                },
                scheduledFor: pkg.scheduledFor,
                errorMessage: pkg.error,
                createdAt: pkg.createdAt,
            };
        });

        let combined = [...normalizedDrafts, ...normalizedPackages];

        // Filter by source if requested
        if (source && source !== "all") {
            combined = combined.filter(d => {
                const s = d.platformOptions?.source;
                return s === source;
            });
        }

        // Filter by platform if requested
        if (platform && platform !== "all") {
            combined = combined.filter(d => {
                const opts = d.platformOptions as any;
                if (platform.toLowerCase() === "theme" || platform.toLowerCase() === "theme_studio") {
                    return Boolean(opts?.isThemePackage);
                }
                const p = opts?.platform?.toLowerCase();
                return p === platform.toLowerCase();
            });
        }

        // Sort chronologically descending
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return { drafts: combined };
    } catch (error: any) {
        console.error("Failed to fetch drafts:", error);
        return { error: "Failed to fetch drafts" };
    }
}

export async function getDraftCounts() {
    try {
        const tenantId = await getActiveTenantId();
        const [allDrafts, allPackages] = await Promise.all([
            db.query.drafts.findMany({
                where: eq(drafts.tenantId, tenantId),
                columns: { id: true, status: true, scheduledFor: true }
            }),
            db.query.contentPackages.findMany({
                where: eq(contentPackages.tenantId, tenantId),
                columns: { id: true, status: true, scheduledFor: true }
            })
        ]);

        const counts: Record<string, number> = {
            all: allDrafts.length + allPackages.length,
            pending_review: 0,
            scheduled: 0,
            approved: 0,
            published: 0,
            publishing: 0,
            failed: 0,
            rejected: 0,
        };

        for (const d of allDrafts) {
            if (d.status === "scheduled" || (d.status === "approved" && d.scheduledFor !== null)) {
                counts.scheduled++;
            } else if (d.status === "approved" && d.scheduledFor === null) {
                counts.approved++;
            } else if (counts[d.status] !== undefined) {
                counts[d.status]++;
            }
        }

        for (const p of allPackages) {
            if (p.status === "scheduled" || (p.status === "approved" && p.scheduledFor !== null)) {
                counts.scheduled++;
            } else if (p.status === "approved" && p.scheduledFor === null) {
                counts.approved++;
            } else if (p.status === "publishing") {
                counts.publishing++;
            } else if (counts[p.status] !== undefined) {
                counts[p.status]++;
            }
        }

        return { counts };
    } catch (error: any) {
        return { counts: { all: 0, pending_review: 0, scheduled: 0, approved: 0, publishing: 0, published: 0, failed: 0, rejected: 0 } };
    }
}

export async function getPendingDraftCount() {
    try {
        const tenantId = await getActiveTenantId();
        const [draftPending, packagePending] = await Promise.all([
            db.query.drafts.findMany({
                where: and(eq(drafts.tenantId, tenantId), eq(drafts.status, "pending_review")),
                columns: { id: true }
            }),
            db.query.contentPackages.findMany({
                where: and(eq(contentPackages.tenantId, tenantId), eq(contentPackages.status, "pending_review")),
                columns: { id: true }
            })
        ]);

        return { count: draftPending.length + packagePending.length };
    } catch (error: any) {
        console.error("Failed to fetch pending draft count:", error);
        return { count: 0 };
    }
}

export async function updateDraft(draftId: string, content: string) {
    try {
        if (!content || typeof content !== "string" || content.trim().length === 0) {
            return { error: "Content cannot be empty" };
        }
        if (content.length > 50000) {
            return { error: "Content exceeds maximum length of 50,000 characters" };
        }

        const tenantId = await getActiveTenantId();
        
        const existingDraft = await db.query.drafts.findFirst({
            where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)),
            columns: { id: true }
        });

        if (existingDraft) {
            const changed = await db.update(drafts)
                .set({ content })
                .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId), editableDraft())).returning({ id: drafts.id });
            if (!changed.length) return { error: "This draft is already publishing or requires publication verification. Refresh before editing or reviewing it." };
            return { success: true };
        }

        const existingPackage = await db.query.contentPackages.findFirst({
            where: and(eq(contentPackages.id, draftId), eq(contentPackages.tenantId, tenantId)),
            columns: { id: true, title: true, caption: true, metrics: true }
        });

        if (existingPackage) {
            let newTitle = existingPackage.title;
            let newCaption = content.trim();

            if (content.startsWith(existingPackage.title + "\n\n")) {
                newCaption = content.slice((existingPackage.title + "\n\n").length).trim();
            } else if (content.startsWith(existingPackage.title + "\n")) {
                newCaption = content.slice((existingPackage.title + "\n").length).trim();
            } else {
                const breakIdx = content.indexOf("\n\n");
                if (breakIdx !== -1) {
                    newTitle = content.slice(0, breakIdx).trim();
                    newCaption = content.slice(breakIdx + 2).trim();
                }
            }

            const changed = await db.update(contentPackages)
                .set({ title: newTitle, caption: newCaption, status: "pending_review", ...(newTitle !== existingPackage.title || (!(existingPackage.metrics as Record<string, unknown> | null)?.renderJobId && newCaption !== existingPackage.caption) ? { renderedAssetUrls: [] } : {}), updatedAt: new Date() })
                .where(and(eq(contentPackages.id, draftId), eq(contentPackages.tenantId, tenantId), editablePackage())).returning({ id: contentPackages.id });
            if (!changed.length) return { error: "This post has already been submitted for publishing. Review it in Theme Studio." };
            return { success: true };
        }

        return { error: "Draft not found" };
    } catch (error: any) {
        console.error("Failed to update draft:", error);
        return { error: "Failed to update draft" };
    }
}

export async function approveDraft(draftId: string, variantName?: string, content?: string) {
    try {
        if (content && content.length > 50000) {
            return { error: "Content exceeds maximum length of 50,000 characters" };
        }

        const tenantId = await getActiveTenantId();
        
        const existingDraft = await db.query.drafts.findFirst({
            where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)),
        });

        if (existingDraft) {
            const updateData: Partial<typeof drafts.$inferInsert> & { status: string; errorMessage: null } = { status: "approved", errorMessage: null };
            if (variantName && content) {
                updateData.selectedVariantId = variantName;
                updateData.content = content;
            } else if (!existingDraft.content) {
                return { error: "Cannot approve a draft without content. Please select a variant." };
            }

            const changed = await db.update(drafts)
                .set(updateData)
                .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId), editableDraft())).returning({ id: drafts.id });
            if (!changed.length) return { error: "This draft is already publishing or requires publication verification. Refresh before editing or reviewing it." };

            return { success: true };
        }

        // Check if it's a theme studio content package
        const existingPackage = await db.query.contentPackages.findFirst({
            where: and(eq(contentPackages.id, draftId), eq(contentPackages.tenantId, tenantId)),
        });

        if (existingPackage) {
            const res = await reviewThemePackage(draftId, "approve");
            if (res.error) return { error: res.error };
            return { success: true };
        }

        return { error: "Draft not found" };
    } catch (error: any) {
        console.error("Failed to approve draft:", error);
        return { error: "Failed to approve draft" };
    }
}

export async function rejectDraft(draftId: string, feedback: string) {
    try {
        if (feedback && feedback.length > 5000) {
            return { error: "Feedback exceeds maximum length of 5,000 characters" };
        }

        const tenantId = await getActiveTenantId();
        
        const existingDraft = await db.query.drafts.findFirst({
            where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)),
            columns: { id: true }
        });

        if (existingDraft) {
            const changed = await db.update(drafts)
                .set({ status: "rejected", errorMessage: feedback })
                .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId), editableDraft())).returning({ id: drafts.id });
            if (!changed.length) return { error: "This draft is already publishing or requires publication verification. Refresh before editing or reviewing it." };
            return { success: true };
        }

        const existingPackage = await db.query.contentPackages.findFirst({
            where: and(eq(contentPackages.id, draftId), eq(contentPackages.tenantId, tenantId)),
            columns: { id: true }
        });

        if (existingPackage) {
            const res = await reviewThemePackage(draftId, "reject", feedback);
            if (res.error) return { error: res.error };
            return { success: true };
        }

        return { error: "Draft not found" };
    } catch (error: any) {
        console.error("Failed to reject draft:", error);
        return { error: "Failed to reject draft" };
    }
}

export async function deleteDraft(draftId: string) {
    try {
        const tenantId = await getActiveTenantId();
        
        const existingDraft = await db.query.drafts.findFirst({
            where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)),
            columns: { id: true }
        });

        if (existingDraft) {
            const changed = await db.delete(drafts)
                .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId), editableDraft())).returning({ id: drafts.id });
            if (!changed.length) return { error: "This draft is already publishing or requires publication verification. Refresh before editing or reviewing it." };
            return { success: true };
        }

        const existingPackage = await db.query.contentPackages.findFirst({
            where: and(eq(contentPackages.id, draftId), eq(contentPackages.tenantId, tenantId)),
            columns: { id: true }
        });

        if (existingPackage) {
            const changed = await db.delete(contentPackages)
                .where(and(eq(contentPackages.id, draftId), eq(contentPackages.tenantId, tenantId), editablePackage())).returning({ id: contentPackages.id });
            if (!changed.length) return { error: "This post has already been submitted for publishing. Review it in Theme Studio." };
            return { success: true };
        }

        return { error: "Draft not found" };
    } catch (error: any) {
        console.error("Failed to delete draft:", error);
        return { error: error.message || "Failed to delete draft" };
    }
}

export async function bulkApproveDrafts(draftIds: string[]) {
    if (!Array.isArray(draftIds) || draftIds.length > 100) return { error: "Select up to 100 drafts at a time." };
    await getActiveTenantId();
    let count = 0;
    for (const id of new Set(draftIds)) if ((await approveDraft(id)).success) count++;
    return { success: true, count };
}

export async function bulkRejectDrafts(draftIds: string[], feedback?: string) {
    if (!Array.isArray(draftIds) || draftIds.length > 100) return { error: "Select up to 100 drafts at a time." };
    if (feedback && feedback.length > 5000) return { error: "Feedback must be 5,000 characters or fewer." };
    await getActiveTenantId();
    let count = 0;
    for (const id of new Set(draftIds)) if ((await rejectDraft(id, feedback || "Rejected via bulk action")).success) count++;
    return { success: true, count };
}

export async function bulkDeleteDrafts(draftIds: string[]) {
    if (!Array.isArray(draftIds) || draftIds.length > 100) return { error: "Select up to 100 drafts at a time." };
    await getActiveTenantId();
    let count = 0;
    for (const id of new Set(draftIds)) if ((await deleteDraft(id)).success) count++;
    return { success: true, count };
}
