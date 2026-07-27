'use server';

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { agentConfigs, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function getTenantId() {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
        throw new Error("Unauthorized");
    }

    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.ownerId, session.user.id)
    });

    if (!tenant) {
        throw new Error("No tenant found");
    }

    return tenant.id;
}

export async function getAgentConfig() {
    try {
        const tenantId = await getTenantId();
        
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
        const tenantId = await getTenantId();
        
        await db.insert(agentConfigs)
            .values({
                tenantId,
                brandVoice: data.brandVoice,
                postingGoals: data.postingGoals,
                postingSchedule: data.postingSchedule,
            })
            .onConflictDoUpdate({
                target: agentConfigs.tenantId,
                set: {
                    brandVoice: data.brandVoice,
                    postingGoals: data.postingGoals,
                    postingSchedule: data.postingSchedule,
                    updatedAt: new Date()
                }
            });

        return { success: true };
    } catch (error: any) {
        console.error("Failed to save agent config:", error);
        return { error: "Failed to save configuration" };
    }
}
