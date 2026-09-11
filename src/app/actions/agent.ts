'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { agentConfigs, socialAccounts } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { computeNextDraftTime, type PostingSchedule } from "@/lib/agent-schedule";
import { agentConfigSchema } from "@/lib/agent-config-validation";

export type { PostingSchedule };

export async function getAgentConfig() {
    try {
        const tenantId = await getActiveTenantId();
        
        let config = await db.query.agentConfigs.findFirst({
            where: eq(agentConfigs.tenantId, tenantId)
        });

        if (!config) {
            // Create a default empty config with future scheduled slot
            const defaultSchedule: PostingSchedule = {
                timezone: "UTC",
                activeDays: ["mon", "tue", "wed", "thu", "fri"],
                times: ["09:00", "15:00"],
                selectedAccountIds: []
            };
            const nextDraft = computeNextDraftTime(new Date(), defaultSchedule);
            await db.insert(agentConfigs).values({
                tenantId,
                brandVoice: "",
                postingGoals: "",
                nextDraftAt: nextDraft,
                postingSchedule: defaultSchedule
            }).onConflictDoNothing({ target: agentConfigs.tenantId });
            config = await db.query.agentConfigs.findFirst({ where: eq(agentConfigs.tenantId, tenantId) });
        }

        return { config };
    } catch (error: any) {
        console.error("Failed to fetch agent config:", error);
        return { error: "Failed to fetch agent configuration" };
    }
}

export async function saveAgentConfig(data: {
    brandVoice: string;
    postingGoals: string;
    postingSchedule: PostingSchedule;
}) {
    try {
        const tenantId = await getActiveTenantId();
        const parsed = agentConfigSchema.safeParse(data);
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your configuration." };
        data = parsed.data;
        const selected = parsed.data.postingSchedule.selectedAccountIds;
        if (selected.length) {
            const accounts = await db.query.socialAccounts.findMany({
                where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true), inArray(socialAccounts.id, selected)),
                columns: { id: true },
            });
            if (accounts.length !== selected.length) return { error: "Select connected accounts from this workspace." };
        }
        const nextDraft = computeNextDraftTime(new Date(), data.postingSchedule);

        // Atomic monotonic version stamp, computed inside the upsert: the
        // conflicting row is locked, so concurrent saves serialize and the
        // second committer always lands strictly after the first. Memory
        // syncs can therefore totally order rapid saves (a read-compute-
        // write in JS could not — two readers would compute the same stamp).
        await db.insert(agentConfigs)
            .values({
                tenantId,
                brandVoice: data.brandVoice,
                postingGoals: data.postingGoals,
                postingSchedule: data.postingSchedule,
                nextDraftAt: nextDraft,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: agentConfigs.tenantId,
                set: {
                    brandVoice: data.brandVoice,
                    postingGoals: data.postingGoals,
                    postingSchedule: data.postingSchedule,
                    nextDraftAt: nextDraft,
                    updatedAt: sql`GREATEST(now(), ${agentConfigs.updatedAt} + interval '1 millisecond')`
                }
            });

        return { success: true };
    } catch (error: any) {
        console.error("Failed to save agent config:", error);
        return { error: "Failed to save configuration" };
    }
}
