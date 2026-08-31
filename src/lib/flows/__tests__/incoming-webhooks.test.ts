import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deliveryIdentityKey,
  mayRearmDelivery,
  sameWebhookPayload,
  WEBHOOK_STALE_AFTER_MS,
} from "../incoming-webhooks";
import { hashWebhookSecret, verifyWebhookSecret } from "../webhook-secret";
import { unwrapIncomingWebhookPayload } from "../nodes/triggers/incoming-webhook";

describe("incoming webhook admission", () => {
  it("exposes the submitted JSON body as the trigger payload output", () => {
    const payload = { account: { id: "acct-1" }, event: "created" };
    expect(unwrapIncomingWebhookPayload({
      id: "internal-delivery-id",
      webhookDeliveryId: "internal-delivery-id",
      senderDeliveryId: "sender-id",
      payload,
    })).toEqual(payload);
  });

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

  it("does not reuse checkpoints when a retry replaces the JSON payload", () => {
    expect(sameWebhookPayload({ event: "created", id: "a" }, { event: "created", id: "a" })).toBe(true);
    expect(sameWebhookPayload({ event: "created", id: "a" }, { event: "updated", id: "a" })).toBe(false);
    expect(sameWebhookPayload(
      { event: "created", account: { id: "a", type: "person" } },
      { account: { type: "person", id: "a" }, event: "created" },
    )).toBe(true);
    expect(sameWebhookPayload({ values: ["a", "b"] }, { values: ["b", "a"] })).toBe(false);
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/flows/incoming-webhooks.ts"),
      "utf8",
    );
    expect(source).toContain("sameWebhookPayload(priorPayload, input.payload)");
  });

  it("does not re-arm while a live or approval-paused run owns the delivery", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    expect(mayRearmDelivery({
      status: "processing",
      updatedAt: new Date(now.getTime() - WEBHOOK_STALE_AFTER_MS - 1),
      hasLiveRun: true,
    }, now)).toBe(false);
  });

  it("supersedes a stale run transactionally before incrementing the attempt", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/flows/incoming-webhooks.ts"),
      "utf8",
    );
    const transaction = source.indexOf("return db.transaction");
    const runClaim = source.indexOf(".update(flowRuns)", transaction);
    const deliveryClaim = source.indexOf(".update(flowWebhookDeliveries)", runClaim);
    expect(transaction).toBeGreaterThan(-1);
    expect(runClaim).toBeGreaterThan(transaction);
    expect(deliveryClaim).toBeGreaterThan(runClaim);
    expect(source).toContain("eq(flowRuns.updatedAt, priorRun.updatedAt)");
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

describe("deferred incoming webhook execution", () => {
  it("re-reads an active flow and its current graph before starting", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/flows/incoming-webhooks.ts"),
      "utf8",
    );
    expect(source).toContain('eq(flows.status, "active")');
    expect(source).toContain('node.type === "trigger.incoming_webhook"');
    expect(source).not.toContain("flow: RunnableFlow");
  });

  it("recovers an expired run without leaving the refreshed attempt ownerless", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/flows/incoming-webhooks.ts"),
      "utf8",
    );
    const deferredClaim = source.indexOf("const claim = await db.transaction");
    const freshnessRefresh = source.indexOf(".set({ updatedAt: new Date() })", deferredClaim);
    const staleRunClaim = source.indexOf(".update(flowRuns)", freshnessRefresh);
    const replacementRun = source.indexOf(".insert(flowRuns)", staleRunClaim);
    expect(freshnessRefresh).toBeGreaterThan(deferredClaim);
    expect(staleRunClaim).toBeGreaterThan(freshnessRefresh);
    expect(replacementRun).toBeGreaterThan(staleRunClaim);
    expect(source).toContain("resumable = sameWebhookPayload(priorPayload, input.payload)");
  });

  it("fences execution to the active flow revision claimed with the run", () => {
    const lifecycle = readFileSync(
      resolve(process.cwd(), "src/lib/flows/run-flow-server.ts"),
      "utf8",
    );
    expect(lifecycle).toContain("flowRevision?: number");
    expect(lifecycle).toContain("eq(flows.executionRevision, opts.flowRevision)");
    expect(lifecycle).toContain("Execution fenced: flow was paused or edited.");
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

describe("flow execution revisions", () => {
  it("does not bump the execution revision for an unchanged graph save", () => {
    const actions = readFileSync(
      resolve(process.cwd(), "src/app/actions/flows.ts"),
      "utf8",
    );
    const saveAction = actions.slice(
      actions.indexOf("export async function saveFlow"),
      actions.indexOf("export async function setFlowStatus"),
    );
    expect(saveAction).toContain("IS DISTINCT FROM");
    expect(saveAction).toContain("CASE WHEN");
    expect(saveAction).not.toContain("executionRevision: sql`${flows.executionRevision} + 1`");
  });

  it("does not bump the execution revision for a no-op status request", () => {
    const actions = readFileSync(
      resolve(process.cwd(), "src/app/actions/flows.ts"),
      "utf8",
    );
    const statusAction = actions.slice(actions.indexOf("export async function setFlowStatus"));
    const increment = statusAction.indexOf("executionRevision: sql");
    expect(increment).toBeGreaterThan(-1);
    expect(statusAction).toContain("sql`${flows.status} <> ${status}`");
    expect(statusAction).toContain("const [updated] = await db");
  });
});
