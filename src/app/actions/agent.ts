'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { agentConfigs, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function getAgentConfig() {
    try {
        const tenantId = await getActiveTenantId();
        
        let config = await db.query.agentConfigs.findFirst({
            where: eq(agentConfigs.tenantId, tenantId)
        });

        if (!config) {
            // Create a default empty config
            const [newConfig] = await db.insert(agentConfigs).values({
                tenantId,
                brandVoice: "",
                postingGoals: "",
                postingSchedule: {
                    timezone: "UTC",
                    activeDays: ["mon", "tue", "wed", "thu", "fri"],
                    times: ["09:00", "15:00"],
                    selectedAccountIds: []
                }
            }).returning();
            config = newConfig;
        }

        return { config };
    } catch (error: any) {
        console.error("Failed to fetch agent config:", error);
        return { error: "Failed to fetch agent configuration" };
    }
}

export interface PostingSchedule {
    timezone: string;
    activeDays: string[];
    times: string[];
    selectedAccountIds: string[];
}

export async function saveAgentConfig(data: {
    brandVoice: string;
    postingGoals: string;
    postingSchedule: PostingSchedule;
}) {
    try {
        const tenantId = await getActiveTenantId();

        // Monotonic version stamp: rapid saves within the same millisecond
        // must still order totally, otherwise concurrent memory syncs cannot
        // tell stale brand guidance from fresh (equal timestamps race).
        const previous = await db.query.agentConfigs.findFirst({
            where: eq(agentConfigs.tenantId, tenantId),
            columns: { updatedAt: true },
        });
        const versionStamp = new Date(
            Math.max(Date.now(), (previous?.updatedAt?.getTime() ?? 0) + 1),
        );

        await db.insert(agentConfigs)
            .values({
                tenantId,
                brandVoice: data.brandVoice,
                postingGoals: data.postingGoals,
                postingSchedule: data.postingSchedule,
                updatedAt: versionStamp,
            })
            .onConflictDoUpdate({
                target: agentConfigs.tenantId,
                set: {
                    brandVoice: data.brandVoice,
                    postingGoals: data.postingGoals,
                    postingSchedule: data.postingSchedule,
                    updatedAt: versionStamp
                }
            });

        return { success: true };
    } catch (error: any) {
        console.error("Failed to save agent config:", error);
        return { error: "Failed to save configuration" };
    }
}
