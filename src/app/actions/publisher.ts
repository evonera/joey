'use server';

import { executePublishDraft, getZernioClientForTenant } from "@/lib/publisher-core";
import { requireRole } from "@/lib/auth";
import type { DraftPublicationConfirmation } from "@/lib/publication-confirmation";
import { db } from "@/lib/db";
import { drafts, socialAccounts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const confirmationSchema = z.object({
    content: z.string().max(50_000).nullable(), platformOptions: z.unknown(), status: z.string().max(50),
    scheduledFor: z.string().datetime().nullable(),
    account: z.object({ id: z.string().min(1).max(128), accountName: z.string().nullable(), platform: z.string(), platformAccountId: z.string() }).strict(),
}).strict();

export async function prepareDraftPublication(draftId: string): Promise<{ confirmation?: DraftPublicationConfirmation; error?: string }> {
    try {
        const tenantId = await requireRole(["owner", "admin"]);
        const draft = await db.query.drafts.findFirst({ where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)) });
        if (!draft) return { error: "Draft not found." };
        const options = draft.platformOptions as { accountId?: unknown; accountIds?: unknown } | null;
        const id = typeof options?.accountId === "string" ? options.accountId : Array.isArray(options?.accountIds) && options.accountIds.length === 1 && typeof options.accountIds[0] === "string" ? options.accountIds[0] : undefined;
        if (!id) return { error: "Choose a specific destination in Compose before publishing." };
        const account = await db.query.socialAccounts.findFirst({ where: and(eq(socialAccounts.id, id), eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true)) });
        if (!account) return { error: "The selected account is unavailable." };
        return { confirmation: { content: draft.content, platformOptions: draft.platformOptions, status: draft.status, scheduledFor: draft.scheduledFor?.toISOString() ?? null, account: { id: account.id, accountName: account.accountName, platform: account.platform, platformAccountId: account.platformAccountId } } };
    } catch { return { error: "Could not prepare publication. Refresh and try again." }; }
}

export async function publishConfirmedDraft(draftId: string, publishEarly: boolean, input: DraftPublicationConfirmation) {
    try {
        const tenantId = await requireRole(["owner", "admin"]);
        const parsed = confirmationSchema.safeParse(input);
        if (!parsed.success) return { error: "Invalid publication confirmation. Refresh and try again." };
        const { zernio } = await getZernioClientForTenant(tenantId);
        return await executePublishDraft(draftId, tenantId, zernio, publishEarly === true, parsed.data);
    } catch { return { error: "Could not publish the draft. Please try again." }; }
}

// Legacy callers must obtain and submit a reviewed snapshot.
export async function publishDraft(draftId: string, publishEarly = false): Promise<{ success?: boolean; error?: string; status?: string }> {
    try {
        await requireRole(["owner", "admin"]);
        void draftId; void publishEarly;
        return { error: "Refresh and confirm the draft before publishing." };
    } catch { return { error: "Could not publish the draft." }; }
}
