import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";

await requireDisposableDatabase();
const { recoverStaleWebhookDeliveries } = await import("../../src/lib/flows/incoming-webhooks");
assert.equal(await recoverStaleWebhookDeliveries(), 0);
console.log("Webhook recovery acceptance passed: stale-delivery query executes against PostgreSQL.");
// This one-shot acceptance script exits after the database round-trip instead
// of keeping the lazily created postgres-js pool alive on idle sockets.
process.exit(0);
