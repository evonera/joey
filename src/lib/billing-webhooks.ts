import { eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getDodoClient, planForProductId } from "@/lib/dodo";

/** Called only by the Better Auth adapter after signature verification. */
export async function reconcileBillingWebhook(payload: { type: string; data: unknown }) {
  // Payment failures can belong to unrelated one-time purchases. Subscription
  // state, including expiry and payment recovery, owns recurring entitlements.
  if (!payload.type.startsWith("subscription.") && payload.type !== "payment.succeeded") return;
  const data = payload.data as { subscription_id?: string; checkout_session_id?: string | null; metadata?: Record<string, string> };
  const subscriptionId = data?.subscription_id;
  let tenantId = data?.metadata?.tenantId;
  if (!tenantId && subscriptionId) {
    tenantId = (await db.query.tenants.findFirst({
      where: or(
        eq(tenants.dodoSubscriptionId, subscriptionId),
        ...(data.checkout_session_id ? [eq(tenants.dodoCheckoutId, data.checkout_session_id)] : []),
      ),
      columns: { id: true },
    }))?.id;
  }
  if (!subscriptionId || !tenantId) {
    throw new Error("Subscription is missing its workspace mapping; reconciliation required.");
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM ${tenants} WHERE id = ${tenantId} FOR UPDATE`);
    const tenant = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    if (!tenant?.dodoCustomerId) throw new Error("Subscription workspace has no billing customer.");

    // Read current provider state while holding the workspace lock. Duplicate
    // and delayed events cannot replay old status over a newer subscription.
    const subscription = await getDodoClient().subscriptions.retrieve(subscriptionId);
    if (subscription.metadata.tenantId !== tenantId || subscription.customer.customer_id !== tenant.dodoCustomerId) {
      throw new Error("Subscription customer does not match its workspace.");
    }
    if (tenant.dodoSubscriptionId && tenant.dodoSubscriptionId !== subscriptionId) {
      const current = await getDodoClient().subscriptions.retrieve(tenant.dodoSubscriptionId);
      if (new Date(current.created_at).getTime() >= new Date(subscription.created_at).getTime()) return;
      if (current.status === "active" || current.status === "on_hold") {
        throw new Error("Workspace already has an ongoing subscription; reconciliation required.");
      }
    }

    const plan = planForProductId(subscription.product_id);
    if (!plan) throw new Error("Subscription product is not mapped to a Joey billing plan; reconciliation required.");
    await tx.update(tenants).set({
      dodoSubscriptionId: subscriptionId,
      dodoCheckoutId: null,
      dodoCheckoutUrl: null,
      dodoCheckoutPlan: null,
      subscriptionPlan: plan,
      subscriptionStatus: subscription.status,
    }).where(eq(tenants.id, tenantId));
  });
}
