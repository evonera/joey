import { describe, expect, it, vi } from "vitest";
import { cleanupRetryDelayMs, runOwnsCleanupReservation } from "@/lib/storage-cleanup";
import { deliveryIdentityKey, mayRearmDelivery, sameWebhookPayload, WEBHOOK_STALE_AFTER_MS } from "../incoming-webhooks";
import { runReservedUpload } from "../asset-registration";

describe("cross-system failure invariants", () => {
  it("never recovers a delivery while its prior run is live", () => {
    const now = new Date("2026-08-31T00:00:00Z");
    expect(mayRearmDelivery({ status: "processing", updatedAt: new Date(now.getTime() - WEBHOOK_STALE_AFTER_MS * 10), hasLiveRun: true }, now)).toBe(false);
    expect(mayRearmDelivery({ status: "processing", updatedAt: new Date(now.getTime() - WEBHOOK_STALE_AFTER_MS - 1), hasLiveRun: false }, now)).toBe(true);
  });

  it("isolates sender identifiers across both tenant and flow", () => {
    expect(new Set([deliveryIdentityKey("a", "flow", "event"), deliveryIdentityKey("b", "flow", "event"), deliveryIdentityKey("a", "other", "event")]).size).toBe(3);
    expect(deliveryIdentityKey("a", "flow", null)).toBeNull();
  });

  it("reuses checkpoints for reordered objects but not reordered arrays", () => {
    expect(sameWebhookPayload({ z: 1, nested: { b: 2, a: 1 } }, { nested: { a: 1, b: 2 }, z: 1 })).toBe(true);
    expect(sameWebhookPayload({ items: [1, 2] }, { items: [2, 1] })).toBe(false);
  });

  it("keeps cleanup reservations while a run can still commit an asset", () => {
    expect(runOwnsCleanupReservation("running")).toBe(true);
    expect(runOwnsCleanupReservation("waiting_approval")).toBe(true);
    expect(runOwnsCleanupReservation("failed")).toBe(false);
    expect(runOwnsCleanupReservation("succeeded")).toBe(false);
  });

  it("caps cleanup retry backoff at one hour", () => {
    expect(cleanupRetryDelayMs(0)).toBe(1_000);
    expect(cleanupRetryDelayMs(50)).toBe(60 * 60_000);
  });

  it("preserves the original registration error when compensation also fails", async () => {
    const rearm = vi.fn(async () => undefined);
    await expect(runReservedUpload({ reserve: vi.fn(), upload: vi.fn(), register: async () => { throw new Error("registration fence lost"); }, compensate: async () => { throw new Error("R2 outage"); }, rearm })).rejects.toThrow("registration fence lost");
    expect(rearm).toHaveBeenCalledOnce();
  });
});
