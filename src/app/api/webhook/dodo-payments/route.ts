import { Webhooks } from '@dodopayments/nextjs'
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const POST = Webhooks({
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY!,
    onSubscriptionActive: async (payload: any) => {
        const tenantId = payload.data?.metadata?.tenant_id;
        if (!tenantId) return;

        await db.update(tenants)
            .set({ 
                subscriptionPlan: "pro", 
                subscriptionStatus: "active",
                dodoCustomerId: payload.data?.customer?.customer_id
            })
            .where(eq(tenants.id, tenantId));
    },
    onSubscriptionCancelled: async (payload: any) => {
        const tenantId = payload.data?.metadata?.tenant_id;
        if (!tenantId) return;

        await db.update(tenants)
            .set({ subscriptionStatus: "canceled" })
            .where(eq(tenants.id, tenantId));
    },
    onPaymentFailed: async (payload: any) => {
        const tenantId = payload.data?.metadata?.tenant_id;
        if (!tenantId) return;

        await db.update(tenants)
            .set({ subscriptionStatus: "past_due" })
            .where(eq(tenants.id, tenantId));
    },
});
