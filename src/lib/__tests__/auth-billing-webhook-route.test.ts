import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reconcile: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/billing-webhooks", () => ({ reconcileBillingWebhook: mocks.reconcile }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

async function configuredAuth() {
  vi.stubEnv("DODO_PAYMENTS_WEBHOOK_SECRET", "whsec_dGVzdC1vbmx5LWtleQ==");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.resetModules();
  return (await import("@/lib/auth")).auth;
}

function webhookRequest(signature?: string) {
  const now = new Date().toISOString();
  const payload = JSON.stringify({ business_id: "business_test", type: "subscription.active", timestamp: now, data: {
    payload_type: "Subscription", subscription_id: "sub_test", addons: [],
    billing: { city: "Test", country: "US", state: "CA", street: "Test street", zipcode: "90001" },
    brand_id: "brand_test", cancel_at_next_billing_date: false, created_at: now,
    credit_entitlement_cart: [], currency: "USD",
    customer: { customer_id: "customer_test", email: "billing@example.test", name: "Test" },
    metadata: { tenantId: "tenant_test" }, meter_credit_entitlement_cart: [], meters: [],
    next_billing_date: now, on_demand: false, payment_frequency_count: 1,
    payment_frequency_interval: "Month", previous_billing_date: now, product_id: "product_test",
    quantity: 1, recurring_pre_tax_amount: 1900, status: "active", subscription_period_count: 1,
    subscription_period_interval: "Month", tax_inclusive: false, trial_period_days: 0,
  } });
  const id = "msg_auth_route_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHmac("sha256", Buffer.from("test-only-key")).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return new Request("http://localhost:3000/api/auth/dodopayments/webhooks", {
    method: "POST",
    headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": signature ?? `v1,${digest}` },
    body: payload,
  });
}

describe("mounted Better Auth workspace billing webhook", () => {
  it("rejects an invalid signature without reconciling", async () => {
    const auth = await configuredAuth();
    const response = await auth.handler(webhookRequest("v1,aW52YWxpZA=="));
    expect(response.status).toBe(400);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("delivers a verified event to workspace reconciliation at the unchanged route", async () => {
    const auth = await configuredAuth();
    const response = await auth.handler(webhookRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.reconcile).toHaveBeenCalledOnce();
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({ type: "subscription.active", data: expect.objectContaining({ subscription_id: "sub_test", metadata: { tenantId: "tenant_test" } }) }));
  });
});
