import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";

await requireDisposableDatabase();
const { recoverStaleWebhookDeliveries } = await import("../../src/lib/flows/incoming-webhooks");
assert.equal(await recoverStaleWebhookDeliveries(), 0);
console.log("Webhook recovery acceptance passed: stale-delivery query executes against PostgreSQL.");
