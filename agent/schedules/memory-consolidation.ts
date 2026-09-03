import { defineSchedule } from "eve/schedules";
import eveChannel from "../channels/eve";
import { db } from "@/lib/db";
import { agentConfigs, member, memories, tenantMemoryProfiles } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { assertBudget } from "@/lib/usage";
import { recordAutomationRun } from "@/lib/automation-runs";
import { withTimeout } from "@/lib/dispatch-claim";

/** Skip workspaces with fewer memories than this: nothing worth merging. */
const MIN_MEMORIES_TO_CONSOLIDATE = 5;
/** At most one consolidation per tenant per week (cursor: lastCompactedAt). */
const CONSOLIDATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** Admission budget per tenant dispatch; a timeout retries next tick. */
const CONSOLIDATION_SEND_TIMEOUT_MS = 55_000;

function consolidationPrompt(): string {
  return [
    "Nightly memory consolidation for this workspace. Tidy long-term memory using ONLY the list_memories, search_memory, remember, and forget_memory tools. Do not message anyone.",
    "",
    "1. Load entries with list_memories in pages of 20 (up to 200 total, newest first).",
    "2. Merge duplicates: when several entries say the same thing, save one entry with the best phrasing (entity-centric, e.g. \"Brand voice is playful and concise\") using remember, then forget the redundant ones. Skip this when entries only look similar but carry distinct details.",
    "3. Resolve contradictions: when two entries conflict, keep the more recent one (createdAt) and forget the outdated one. If recency is unclear, keep both.",
    "4. Promote stable patterns: a fact that keeps showing up or is clearly durable (routines, relationships, strong preferences, ongoing projects) becomes one strategy_insight entry via remember; forget the transient duplicates it replaces.",
    "5. Prune: forget one-off context that is clearly spent (past events long over, short-lived states, completed errands). Keep anything with lasting value.",
    "",
    "Be conservative: when in doubt, keep the memory. Never forget an entry unless it is directly superseded by a merged or newer version you just saved. Aim for a small, high-signal set of edits (max ~20), not a rewrite.",
  ].join("\n");
}

/**
 * Nightly "dreaming" pass over pgvector long-term memory, one agent session
 * per eligible tenant. Sessions are tenant-scoped via auth attributes (every
 * memory tool fences on tenantId), spend-gated via assertBudget, and
 * rate-limited to one run per tenant per week via lastCompactedAt.
 */
export default defineSchedule({
  cron: "15 8 * * *",
  async run({ to, waitUntil }) {
    const counts = await db
      .select({ tenantId: memories.tenantId, count: sql<number>`count(*)::int` })
      .from(memories)
      .groupBy(memories.tenantId)
      .having(sql`count(*) >= ${MIN_MEMORIES_TO_CONSOLIDATE}`);
    if (counts.length === 0) return;

    const tenantIds = counts.map((row) => row.tenantId);
    const [profiles, configs, owners] = await Promise.all([
      db
        .select({ tenantId: tenantMemoryProfiles.tenantId, lastCompactedAt: tenantMemoryProfiles.lastCompactedAt })
        .from(tenantMemoryProfiles)
        .where(inArray(tenantMemoryProfiles.tenantId, tenantIds)),
      db
        .select({ tenantId: agentConfigs.tenantId, isPaused: agentConfigs.isPaused })
        .from(agentConfigs)
        .where(inArray(agentConfigs.tenantId, tenantIds)),
      db
        .select({ organizationId: member.organizationId, userId: member.userId })
        .from(member)
        .where(and(inArray(member.organizationId, tenantIds), eq(member.role, "owner"))),
    ]);
    const compactedAtByTenant = new Map(profiles.map((row) => [row.tenantId, row.lastCompactedAt]));
    const pausedTenants = new Set(configs.filter((row) => row.isPaused).map((row) => row.tenantId));
    const ownerByTenant = new Map<string, string>();
    for (const row of owners) {
      if (!ownerByTenant.has(row.organizationId)) ownerByTenant.set(row.organizationId, row.userId);
    }

    const now = Date.now();
    for (const { tenantId } of counts) {
      try {
        if (pausedTenants.has(tenantId)) continue;
        const lastCompacted = compactedAtByTenant.get(tenantId);
        if (lastCompacted && now - lastCompacted.getTime() < CONSOLIDATION_INTERVAL_MS) continue;
        const ownerUserId = ownerByTenant.get(tenantId);
        if (!ownerUserId) continue;

        // LLM spend gate (fail-safe: a check error skips rather than spends).
        // Note: assertBudget pauses + notifies over-budget tenants itself.
        let allowed = false;
        try {
          allowed = (await assertBudget(tenantId)).allowed;
        } catch (err) {
          console.error(`[memory-consolidation] Budget check failed for tenant ${tenantId}; skipping:`, err);
          continue;
        }
        if (!allowed) {
          await recordAutomationRun({
            kind: "memory_consolidation",
            automationId: tenantId,
            tenantId,
            status: "error",
            error: "Monthly LLM budget reached; consolidation skipped",
          });
          continue;
        }

        // Dispatch inside waitUntil and await admission: the weekly cursor
        // advances only after the send settles. A rejected send records an
        // error with the cursor untouched, so the tenant is retried on the
        // next nightly tick instead of being skipped for seven days.
        waitUntil(
          (async () => {
            try {
              await withTimeout(
                to(eveChannel, {}).send(consolidationPrompt(), {
                  auth: {
                    authenticator: "cron",
                    principalType: "user",
                    principalId: ownerUserId,
                    attributes: { tenantId },
                  },
                }),
                CONSOLIDATION_SEND_TIMEOUT_MS,
                `consolidation send ${tenantId}`,
              );
              const stampedAt = new Date();
              await db
                .insert(tenantMemoryProfiles)
                .values({ tenantId, lastCompactedAt: stampedAt })
                .onConflictDoUpdate({
                  target: tenantMemoryProfiles.tenantId,
                  set: { lastCompactedAt: stampedAt, updatedAt: stampedAt },
                });
              await recordAutomationRun({
                kind: "memory_consolidation",
                automationId: tenantId,
                tenantId,
                status: "ok",
              });
            } catch (err) {
              console.error(`[memory-consolidation] Dispatch failed for tenant ${tenantId}:`, err);
              await recordAutomationRun({
                kind: "memory_consolidation",
                automationId: tenantId,
                tenantId,
                status: "error",
                error: err instanceof Error ? err.message : String(err),
              });
            }
          })(),
        );
      } catch (err) {
        console.error(`[memory-consolidation] Failed to process tenant ${tenantId}:`, err);
        await recordAutomationRun({
          kind: "memory_consolidation",
          automationId: tenantId,
          tenantId,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },
});
