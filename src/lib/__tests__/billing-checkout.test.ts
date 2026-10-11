import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ retrieve: vi.fn(), checkout: vi.fn(), tenant: vi.fn(), membership: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ getActiveTenantMembership: m.membership, auth: { options: { baseURL: "https://joey.example" }, api: { getSession: async () => ({ user: { email: "owner@example.test" } }) } } }));
vi.mock("@/lib/dodo", async (original) => ({ ...await original<typeof import("@/lib/dodo")>(), getDodoClient: () => ({ subscriptions: { retrieve: m.retrieve }, checkoutSessions: { create: m.checkout } }), productIdForPlan: () => "creator-product" }));
vi.mock("@/lib/db", () => {
  const tx = { execute: vi.fn(), query: { tenants: { findFirst: m.tenant } }, update: () => ({ set: () => ({ where: vi.fn() }) }) };
  return { db: { transaction: (fn: (tx: unknown) => unknown) => fn(tx) } };
});
import { startCheckout } from "@/app/actions/billing";
describe("Checkout with an existing subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.membership.mockResolvedValue({ tenantId: "tenant", role: "owner" });
    m.tenant.mockResolvedValue({ id: "tenant", dodoSubscriptionId: "sub", dodoCustomerId: "customer" });
    m.checkout.mockResolvedValue({ session_id: "checkout", checkout_url: "https://test.checkout.dodopayments.com/example" });
  });
  it.each(["active", "past_due", "on_hold", "paused", "pending", "unknown"])("does not create a duplicate for %s", async status => {
    m.retrieve.mockResolvedValue({ status });
    await expect(startCheckout("creator", "12345678-1234-1234-1234-123456789abc")).rejects.toThrow("already has a subscription");
    expect(m.checkout).not.toHaveBeenCalled();
  });
  it.each(["cancelled", "failed", "expired"])("allows a new checkout after %s", async status => {
    m.retrieve.mockResolvedValue({ status });
    expect(await startCheckout("creator", "12345678-1234-1234-1234-123456789abc")).toHaveProperty("url");
    expect(m.checkout).toHaveBeenCalledOnce();
  });
  it("fails closed if the provider cannot confirm the existing subscription", async () => {
    m.retrieve.mockRejectedValue(new Error("Provider unavailable"));
    await expect(startCheckout("creator", "12345678-1234-1234-1234-123456789abc")).rejects.toThrow("Provider unavailable");
    expect(m.checkout).not.toHaveBeenCalled();
  });
});
