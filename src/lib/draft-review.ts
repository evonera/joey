import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { drafts } from "@/lib/db/schema";
import { assertAvailableSchedule, lockSchedulingAccount } from "./editorial-scheduling";

const REVIEWABLE_STATUSES = ["draft", "pending_review", "approved", "scheduled", "rejected", "failed"];

export type DraftReviewInput = {
  tenantId: string;
  draftId: string;
  decision: "approve" | "reject";
  variantName?: string;
  content?: string;
  feedback?: string;
};

function firstVariant(variants: unknown): { name: string; content: string } | null {
  if (Array.isArray(variants)) {
    const variant = variants[0] as Record<string, unknown> | undefined;
    const name = variant?.variantName ?? variant?.name ?? "default";
    const content = variant?.content ?? variant?.text;
    return typeof content === "string" && content.length > 0
      ? { name: typeof name === "string" ? name : "default", content }
      : null;
  }
  if (variants && typeof variants === "object") {
    const [name, value] = Object.entries(variants)[0] ?? [];
    const record = typeof value === "string" ? { content: value } : value as Record<string, unknown> | undefined;
    const content = record?.content ?? record?.text;
    return typeof name === "string" && typeof content === "string" && content.length > 0
      ? { name, content }
      : null;
  }
  return null;
}

/**
 * Shared state transition for UI, REST, and MCP review. The status and post
 * checks are repeated in the UPDATE predicate so a concurrent publish cannot
 * be reset by a stale review request.
 */
export async function reviewDraft(input: DraftReviewInput): Promise<{ success?: true; error?: string }> {
  if (input.decision === "approve" && (input.variantName === undefined) !== (input.content === undefined)) {
    return { error: "Variant name and content must be provided together." };
  }
  if (input.decision === "approve" && input.variantName !== undefined && !input.variantName.trim()) {
    return { error: "Variant name cannot be empty." };
  }
  if (input.decision === "approve" && input.variantName !== undefined && !input.content?.trim()) {
    return { error: "Variant content cannot be empty." };
  }
  if (input.decision === "approve" && input.content !== undefined && input.content.length > 50_000) {
    return { error: "Content exceeds maximum length of 50,000 characters" };
  }
  if (input.decision === "reject" && input.feedback !== undefined && input.feedback.length > 5_000) {
    return { error: "Feedback exceeds maximum length of 5,000 characters" };
  }

  const existing = await db.query.drafts.findFirst({
    where: and(eq(drafts.id, input.draftId), eq(drafts.tenantId, input.tenantId)),
    columns: { id: true, content: true, variants: true, scheduledFor: true, platformOptions: true },
  });
  if (!existing) return { error: "Draft not found" };

  let selectedVariant = input.variantName;
  let content = input.content;
  if (input.decision === "approve") {
    if (!content?.trim() && existing.content?.trim()) content = existing.content;
    if (!content?.trim()) {
      const variant = firstVariant(existing.variants);
      if (variant) {
        selectedVariant ??= variant.name;
        content = variant.content;
      }
    }
    if (!content?.trim()) return { error: "Cannot approve a draft without content. Please select a variant." };
  }

  const set = input.decision === "approve"
    ? { status: "approved", errorMessage: null, ...(selectedVariant ? { selectedVariantId: selectedVariant } : {}), ...(content ? { content } : {}) }
    : { status: "rejected", errorMessage: input.feedback?.trim() || "Rejected by reviewer" };

  const applyUpdate = (client: Pick<typeof db, "update">) => client.update(drafts)
    .set(set)
    .where(and(
      eq(drafts.id, input.draftId),
      eq(drafts.tenantId, input.tenantId),
      inArray(drafts.status, REVIEWABLE_STATUSES),
      sql`${drafts.content} IS NOT DISTINCT FROM ${existing.content}`,
      sql`${drafts.variants} IS NOT DISTINCT FROM ${existing.variants == null ? null : JSON.stringify(existing.variants)}::jsonb`,
      sql`${drafts.scheduledFor} IS NOT DISTINCT FROM ${existing.scheduledFor?.toISOString() ?? null}::timestamp`,
      sql`${drafts.platformOptions} IS NOT DISTINCT FROM ${existing.platformOptions == null ? null : JSON.stringify(existing.platformOptions)}::jsonb`,
      or(isNull(drafts.errorMessage), sql`${drafts.errorMessage} NOT LIKE 'verify:%'`),
      sql`NOT EXISTS (SELECT 1 FROM posts p WHERE p.draft_id = ${drafts.id} AND p.tenant_id = ${drafts.tenantId})`,
    ))
    .returning({ id: drafts.id });
  let changed;
  if (input.decision === "approve" && existing.scheduledFor) {
    const options = existing.platformOptions as { accountId?: string; accountIds?: string[]; renderJobId?: string; renderStatus?: string } | null;
    const accountIds = typeof options?.accountId === "string" ? [options.accountId] : Array.isArray(options?.accountIds) ? options.accountIds.filter((id): id is string => typeof id === "string") : [];
    if (!accountIds.length || accountIds.length > 20) return { error: "Choose valid target accounts before approving a proposed schedule." };
    if (options?.renderJobId && options.renderStatus !== "succeeded") return { error: "Wait for finished media before approving a proposed schedule." };
    try {
      changed = await db.transaction(async tx => {
        for (const id of [...new Set(accountIds)].sort()) {
          await lockSchedulingAccount(tx, input.tenantId, id);
          await assertAvailableSchedule(tx, input.tenantId, id, existing.scheduledFor!, input.draftId);
        }
        return applyUpdate(tx);
      });
    } catch { return { error: "The proposed schedule conflicts with another post or its account is unavailable. Choose another time before approving." }; }
  } else changed = await applyUpdate(db);
  const [updated] = changed;

  if (updated) return { success: true };

  // Distinguish a concurrent delete from a row that still exists but has moved
  // into a non-reviewable/publishing state.
  const stillExists = await db.query.drafts.findFirst({
    where: and(eq(drafts.id, input.draftId), eq(drafts.tenantId, input.tenantId)),
    columns: { id: true },
  });
  if (!stillExists) return { error: "Draft not found" };
  return { error: "This draft is already publishing or requires publication verification. Refresh before reviewing it." };
}
