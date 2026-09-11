"use server";

import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth, getActiveTenantMembership } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { BILLING_PLANS, canReuseCheckoutSession, getBillingConfig, getDodoClient, productIdForPlan, type BillingPlan } from "@/lib/dodo";
import { checkUsageLimits } from "@/lib/billing";

export async function getBillingSummary() {
  const membership = await getActiveTenantMembership();
  const [limits, tenant] = await Promise.all([
    checkUsageLimits(membership.tenantId),
    db.query.tenants.findFirst({
      where: eq(tenants.id, membership.tenantId),
      columns: { dodoCustomerId: true, name: true },
    }),
  ]);
  return {
    ...limits,
    workspaceName: tenant?.name || "Workspace",
    configured: getBillingConfig().configured,
    testMode: getBillingConfig().environment === "test_mode",
    canManage: ["owner", "admin"].includes(membership.role),
    hasCustomer: Boolean(tenant?.dodoCustomerId),
  };
}

function billingReturnUrl() {
  return new URL("/settings?tab=billing", auth.options.baseURL as string).toString();
}

export async function startCheckout(plan: BillingPlan, attemptId: string) {
  const { tenantId } = await getActiveTenantMembership(["owner", "admin"]);
  if (!BILLING_PLANS.includes(plan)) throw new Error("Unknown billing plan.");
  if (!/^[\da-f-]{36}$/i.test(attemptId)) throw new Error("Invalid checkout attempt. Please reload and try again.");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  const client = getDodoClient();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM ${tenants} WHERE id = ${tenantId} FOR UPDATE`);
    const tenant = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    if (!tenant) throw new Error("Workspace not found");
    if (tenant.dodoSubscriptionId) {
      const current = await client.subscriptions.retrieve(tenant.dodoSubscriptionId);
      if (["active", "on_hold", "pending"].includes(current.status)) {
        throw new Error("This workspace already has a subscription. Use Manage billing to update it.");
      }
    }
    if (tenant.dodoCheckoutId && tenant.dodoCheckoutUrl) {
      const existing = await client.checkoutSessions.retrieve(tenant.dodoCheckoutId);
      if (existing.payment_status === "succeeded") {
        throw new Error("Payment received. Your subscription is being confirmed; refresh Billing shortly.");
      }
      if (canReuseCheckoutSession(existing.created_at, existing.payment_status)) {
        if (tenant.dodoCheckoutPlan !== plan) {
          throw new Error(`A ${tenant.dodoCheckoutPlan || "different"} checkout is already pending. Complete it or wait for it to expire before choosing another plan.`);
        }
        return { url: tenant.dodoCheckoutUrl };
      }
    }
    let customerId = tenant.dodoCustomerId;
    if (!customerId) {
      const customer = await client.customers.create({
        email: session.user.email,
        name: tenant.name,
        metadata: { tenantId },
      }, { idempotencyKey: `workspace:${tenantId}` });
      customerId = customer.customer_id;
      await tx.update(tenants).set({ dodoCustomerId: customerId }).where(eq(tenants.id, tenantId));
    }
    const checkout = await client.checkoutSessions.create({
      customer: { customer_id: customerId },
      product_cart: [{ product_id: productIdForPlan(plan), quantity: 1 }],
      metadata: { tenantId, plan },
      return_url: billingReturnUrl(),
    }, { idempotencyKey: `workspace:${tenantId}:checkout:${plan}:${attemptId}` });
    if (!checkout.checkout_url) throw new Error("Checkout is unavailable. Please try again.");
    await tx.update(tenants).set({ dodoCheckoutId: checkout.session_id, dodoCheckoutUrl: checkout.checkout_url, dodoCheckoutPlan: plan }).where(eq(tenants.id, tenantId));
    return { url: checkout.checkout_url };
  });
}

/** Backward-compatible entry point for existing clients. */
export async function startProCheckout(attemptId: string) {
  return startCheckout("pro", attemptId);
}

export async function openBillingPortal() {
  const { tenantId } = await getActiveTenantMembership(["owner", "admin"]);
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId), columns: { dodoCustomerId: true },
  });
  if (!tenant?.dodoCustomerId) throw new Error("This workspace has no billing account yet.");
  const portal = await getDodoClient().customers.customerPortal.create(tenant.dodoCustomerId, {
    return_url: billingReturnUrl(),
  });
  return { url: portal.link };
}
