import { and, count, eq, gte, lt, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { flowRuns, flowWebhookDeliveries, r2CleanupTasks, telegramOutbox } from "@/lib/db/schema";

export type OperationalHealth = {
  generatedAt: string;
  flowFailures24h: number;
  staleFlowRuns: number;
  webhookFailures24h: number;
  staleWebhookDeliveries: number;
  cleanupDue: number;
  cleanupRepeatedFailures: number;
  telegramPending: number;
  telegramUncertain: number;
};

export async function getOperationalHealth(tenantId: string, now = new Date()): Promise<OperationalHealth> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const staleRunCutoff = new Date(now.getTime() - 30 * 60_000);
  const staleDeliveryCutoff = new Date(now.getTime() - 10 * 60_000);
  const oldOutboxCutoff = new Date(now.getTime() - 5 * 60_000);

  const [
    flowFailures24h,
    staleFlowRuns,
    webhookFailures24h,
    staleWebhookDeliveries,
    cleanupDue,
    cleanupRepeatedFailures,
    telegramPending,
    telegramUncertain,
  ] = await Promise.all([
    db.select({ value: count() }).from(flowRuns).where(and(eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "failed"), gte(flowRuns.updatedAt, dayAgo))),
    db.select({ value: count() }).from(flowRuns).where(and(eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running"), lt(flowRuns.updatedAt, staleRunCutoff))),
    db.select({ value: count() }).from(flowWebhookDeliveries).where(and(eq(flowWebhookDeliveries.tenantId, tenantId), eq(flowWebhookDeliveries.status, "failed"), gte(flowWebhookDeliveries.updatedAt, dayAgo))),
    db.select({ value: count() }).from(flowWebhookDeliveries).where(and(eq(flowWebhookDeliveries.tenantId, tenantId), eq(flowWebhookDeliveries.status, "processing"), lt(flowWebhookDeliveries.updatedAt, staleDeliveryCutoff))),
    db.select({ value: count() }).from(r2CleanupTasks).where(and(eq(r2CleanupTasks.tenantId, tenantId), lte(r2CleanupTasks.nextAttemptAt, now))),
    db.select({ value: count() }).from(r2CleanupTasks).where(and(eq(r2CleanupTasks.tenantId, tenantId), gte(r2CleanupTasks.attempts, 3))),
    db.select({ value: count() }).from(telegramOutbox).where(and(eq(telegramOutbox.tenantId, tenantId), eq(telegramOutbox.status, "pending"), lt(telegramOutbox.createdAt, oldOutboxCutoff))),
    db.select({ value: count() }).from(telegramOutbox).where(and(eq(telegramOutbox.tenantId, tenantId), eq(telegramOutbox.status, "uncertain"))),
  ]);

  return {
    generatedAt: now.toISOString(),
    flowFailures24h: Number(flowFailures24h[0]?.value ?? 0),
    staleFlowRuns: Number(staleFlowRuns[0]?.value ?? 0),
    webhookFailures24h: Number(webhookFailures24h[0]?.value ?? 0),
    staleWebhookDeliveries: Number(staleWebhookDeliveries[0]?.value ?? 0),
    cleanupDue: Number(cleanupDue[0]?.value ?? 0),
    cleanupRepeatedFailures: Number(cleanupRepeatedFailures[0]?.value ?? 0),
    telegramPending: Number(telegramPending[0]?.value ?? 0),
    telegramUncertain: Number(telegramUncertain[0]?.value ?? 0),
  };
}
