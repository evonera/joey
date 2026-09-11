import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), retrieve: vi.fn(), set: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { transaction: async (fn: any) => fn({ execute: mocks.execute, query: { tenants: { findFirst: mocks.find } }, update: () => ({ set: (value: unknown) => { mocks.set(value); return { where: vi.fn() }; } }) }) } }));
vi.mock("@/lib/dodo", () => ({ planForProductId: (id: string) => id === "pro-product" ? "pro" : undefined, getDodoClient: () => ({ subscriptions: { retrieve: mocks.retrieve } }) }));
import { reconcileBillingWebhook } from "../billing-webhooks";
const event = { type: "subscription.active", data: { subscription_id: "sub-new", metadata: { tenantId: "workspace" } } };
const subscription = { metadata: { tenantId: "workspace" }, customer: { customer_id: "customer" }, product_id: "pro-product", status: "active", created_at: "2026-09-01T00:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue({ dodoCustomerId: "customer" }); mocks.retrieve.mockResolvedValue(subscription); });
describe("verified billing event reconciliation", () => {
  it("ignores unrelated one-time payment failures", async () => {
    await reconcileBillingWebhook({ type: "payment.failed", data: {} });
    expect(mocks.retrieve).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled();
  });
  it("reconciles a successful subscription payment from canonical subscription state", async () => {
    await reconcileBillingWebhook({ type: "payment.succeeded", data: { ...event.data, subscription_id: "sub-new" } });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ subscriptionPlan: "pro", subscriptionStatus: "active" }));
  });
  it("grants the configured product's current entitlement", async () => {
    await reconcileBillingWebhook(event);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ dodoSubscriptionId: "sub-new", subscriptionPlan: "pro", subscriptionStatus: "active" }));
  });
  it("uses canonical state for delayed activation events", async () => {
    mocks.retrieve.mockResolvedValue({ ...subscription, status: "cancelled" });
    await reconcileBillingWebhook(event);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ subscriptionStatus: "cancelled" }));
  });
  it("rejects a customer belonging to another workspace", async () => {
    mocks.retrieve.mockResolvedValue({ ...subscription, customer: { customer_id: "someone-else" } });
    await expect(reconcileBillingWebhook(event)).rejects.toThrow("does not match"); expect(mocks.set).not.toHaveBeenCalled();
  });
  it("rejects an unrelated product instead of silently changing entitlement", async () => {
    mocks.retrieve.mockResolvedValue({ ...subscription, product_id: "other-product" });
    await expect(reconcileBillingWebhook(event)).rejects.toThrow("not mapped");
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("does not let an older subscription overwrite a newer one", async () => {
    mocks.find.mockResolvedValue({ dodoCustomerId: "customer", dodoSubscriptionId: "current" });
    mocks.retrieve.mockResolvedValueOnce(subscription).mockResolvedValueOnce({ ...subscription, created_at: "2026-09-02T00:00:00Z" });
    await reconcileBillingWebhook(event); expect(mocks.set).not.toHaveBeenCalled();
  });
});
