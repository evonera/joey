'use server';

import { getOrCreateUsageRow } from '@/lib/usage';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { tenants, usageTracking } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function getUsage() {
    try {
        const tenantId = await getActiveTenantId();
        
        const usage = await getOrCreateUsageRow(tenantId);

        return { usage };
    } catch (error: any) {
        console.error("Failed to fetch usage tracking:", error);
        return { error: "Failed to fetch usage configuration" };
    }
}
