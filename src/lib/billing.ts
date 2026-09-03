import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function checkUsageLimits(tenantId: string) {
    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        columns: { subscriptionPlan: true, subscriptionStatus: true }
    });

    if (!tenant) {
        throw new Error("Tenant not found");
    }

    const isPro = tenant.subscriptionPlan === 'pro' && tenant.subscriptionStatus === 'active';
    
    // In a real app, you would check actual usage against the usage_tracking table
    // For now, we return the billing state
    return {
        isPro,
        plan: tenant.subscriptionPlan,
        status: tenant.subscriptionStatus
    };
}

export async function requireProPlan(tenantId: string) {
    const limits = await checkUsageLimits(tenantId);
    if (!limits.isPro) {
        throw new Error("This action requires a Pro subscription.");
    }
    return true;
}
