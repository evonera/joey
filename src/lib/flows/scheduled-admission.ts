import { db } from "@/lib/db";
import { flows, flowRuns, tenants } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { checkUsageLimits } from "@/lib/billing";

/** Subscription webhooks cannot race admission. Existing work may settle. */
export async function admitPaidScheduledFlow(tenantId: string, flowId: string, triggerPayload: Record<string, unknown>) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM ${tenants} WHERE id = ${tenantId} FOR SHARE`);
    if (!(await checkUsageLimits(tenantId, tx)).allowsAutonomousCadence) return undefined;
    const flow = await tx.query.flows.findFirst({ where: and(eq(flows.id, flowId), eq(flows.tenantId, tenantId), eq(flows.status, "active")), columns: { id: true } });
    if (!flow) return undefined;
    const [run] = await tx.insert(flowRuns).values({ flowId, tenantId, trigger: "schedule", triggerPayload }).onConflictDoNothing().returning();
    return run;
  });
}
