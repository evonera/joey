import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deliveryIdentityKey,
  mayRearmDelivery,
  WEBHOOK_STALE_AFTER_MS,
} from "../incoming-webhooks";
import { hashWebhookSecret, verifyWebhookSecret } from "../webhook-secret";

describe("incoming webhook admission", () => {
  it("scopes duplicate explicit delivery IDs to one tenant and flow", () => {
    const first = deliveryIdentityKey("tenant-a", "flow-a", "delivery-1");
    expect(deliveryIdentityKey("tenant-a", "flow-a", "delivery-1")).toBe(first);
  });

  it("admits identical no-ID payloads at least once per request", () => {
    expect(deliveryIdentityKey("tenant-a", "flow-a", null)).toBeNull();
    expect(deliveryIdentityKey("tenant-a", "flow-a", null)).toBeNull();
    const migration = readFileSync(
      resolve(process.cwd(), "src/lib/db/migrations/0025_flow_incoming_webhooks.sql"),
      "utf8",
    );
    expect(migration).toContain('WHERE "delivery_id" IS NOT NULL');
  });

  it("re-arms a genuinely stale processing delivery", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    expect(mayRearmDelivery({
      status: "processing",
      updatedAt: new Date(now.getTime() - WEBHOOK_STALE_AFTER_MS - 1),
      hasLiveRun: false,
    }, now)).toBe(true);
  });

  it("does not re-arm while a live or approval-paused run owns the delivery", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    expect(mayRearmDelivery({
      status: "processing",
      updatedAt: new Date(now.getTime() - WEBHOOK_STALE_AFTER_MS - 1),
      hasLiveRun: true,
    }, now)).toBe(false);
  });

  it("isolates the same sender ID across tenants and flows", () => {
    const keys = new Set([
      deliveryIdentityKey("tenant-a", "flow-a", "same"),
      deliveryIdentityKey("tenant-b", "flow-a", "same"),
      deliveryIdentityKey("tenant-a", "flow-b", "same"),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe("incoming webhook secret rotation", () => {
  it("uses a compare-and-swap upgrade so a concurrent rotation cannot be undone", () => {
    const legacy = "legacy-secret";
    let stored = legacy;
    const valueReadByRequest = stored;
    expect(verifyWebhookSecret(legacy, valueReadByRequest)).toBe(true);

    stored = hashWebhookSecret("rotated-secret");
    if (stored === valueReadByRequest) stored = hashWebhookSecret(legacy);

    expect(verifyWebhookSecret("rotated-secret", stored)).toBe(true);
    expect(verifyWebhookSecret(legacy, stored)).toBe(false);

    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/webhooks/flows/[flowId]/route.ts"),
      "utf8",
    );
    expect(route).toContain("eq(flows.webhookSecret, flow.webhookSecret)");
  });
});
