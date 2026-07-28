'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { tenants, usageTracking } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function getUsage() {
    try {
        const tenantId = await getActiveTenantId();
        
        let usage = await db.query.usageTracking.findFirst({
            where: eq(usageTracking.tenantId, tenantId)
        });

        if (!usage) {
            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            const inserted = await db.insert(usageTracking).values({
                tenantId,
                periodStart: firstDayOfMonth,
                inputTokensUsed: 0,
                outputTokensUsed: 0,
                estimatedCostUsd: '0',
                budgetLimitUsd: '5.00',
            })
            .onConflictDoNothing()
            .returning();
            
            if (inserted.length > 0) {
                usage = inserted[0];
            } else {
                usage = await db.query.usageTracking.findFirst({
                    where: eq(usageTracking.tenantId, tenantId)
                });
            }
        }

        return { usage };
    } catch (error: any) {
        console.error("Failed to fetch usage tracking:", error);
        return { error: "Failed to fetch usage configuration" };
    }
}
