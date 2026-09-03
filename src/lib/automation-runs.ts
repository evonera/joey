import { db } from "@/lib/db";
import { automationRuns } from "@/lib/db/schema";
import { operationalEvent } from "@/lib/operations-log";

export type AutomationRunKind =
  | "engagement_dispatch"
  | "webhook_dispatch"
  | "memory_consolidation"
  | "reminder"
  | "webhook";

/**
 * Durable ledger of proactive automation runs. Powers the operations
 * run-history view. Best-effort by design: a ledger write failure must never
 * fail a dispatch, so errors are logged operationally and swallowed.
 */
export async function recordAutomationRun(input: {
  kind: AutomationRunKind;
  automationId: string;
  tenantId?: string | null;
  status: "ok" | "error";
  threadId?: string;
  error?: string;
}): Promise<void> {
  try {
    await db.insert(automationRuns).values({
      tenantId: input.tenantId ?? null,
      kind: input.kind,
      automationId: input.automationId,
      status: input.status,
      threadId: input.threadId ?? null,
      error: input.error?.slice(0, 500) ?? null,
    });
  } catch (error) {
    operationalEvent("warn", "automation_run.record_failed", {
      kind: input.kind,
      automationId: input.automationId,
      tenantId: input.tenantId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
