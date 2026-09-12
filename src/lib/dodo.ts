import DodoPayments from "dodopayments";

export const BILLING_PLANS = ["creator", "pro", "agency"] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];

// Hosted checkout links are deliberately short-lived. Reuse only a recent
// unfinished session; the API status can remain null after the hosted URL has
// expired, which otherwise traps a workspace on a dead link indefinitely.
const CHECKOUT_REUSE_WINDOW_MS = 10 * 60 * 1000;

export function canReuseCheckoutSession(createdAt: string, paymentStatus?: string | null, now = Date.now()) {
  if (["succeeded", "failed", "cancelled"].includes(paymentStatus || "")) return false;
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && created <= now + 60_000 && now - created < CHECKOUT_REUSE_WINDOW_MS;
}

function readProductId(plan: BillingPlan) {
  const upper = plan.toUpperCase();
  return (process.env[`DODO_${upper}_PRODUCT_ID`] || process.env[`NEXT_PUBLIC_DODO_${upper}_PRODUCT_ID`])?.trim();
}

function readLegacyProductIds(plan: BillingPlan) {
  const raw = process.env[`DODO_${plan.toUpperCase()}_LEGACY_PRODUCT_IDS`];
  return raw?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
}

export function getBillingConfig() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
  const webhookKey = (process.env.DODO_PAYMENTS_WEBHOOK_SECRET || process.env.DODO_PAYMENTS_WEBHOOK_KEY)?.trim();
  const productIds = Object.fromEntries(BILLING_PLANS.map((plan) => [plan, readProductId(plan)])) as Record<BillingPlan, string | undefined>;
  const environment = process.env.DODO_PAYMENTS_ENVIRONMENT || "test_mode";
  return {
    apiKey, webhookKey, productIds, productId: productIds.pro, environment,
    configured: Boolean(apiKey && webhookKey && BILLING_PLANS.every((plan) => productIds[plan]) && ["test_mode", "live_mode"].includes(environment)),
  };
}

export function productIdForPlan(plan: BillingPlan) {
  const productId = getBillingConfig().productIds[plan];
  if (!productId) throw new Error(`Billing product for ${plan} is not configured.`);
  return productId;
}

export function planForProductId(productId: string): BillingPlan | undefined {
  const config = getBillingConfig();
  return BILLING_PLANS.find(
    (plan) => config.productIds[plan] === productId || readLegacyProductIds(plan).includes(productId),
  );
}

export function getDodoClient() {
  const config = getBillingConfig();
  if (!config.configured) throw new Error("Billing is not configured. Please contact the workspace administrator.");
  return new DodoPayments({
    bearerToken: config.apiKey!,
    environment: config.environment as "test_mode" | "live_mode",
    timeout: 15_000,
  });
}
