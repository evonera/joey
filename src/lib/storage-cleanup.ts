import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { flowRuns, r2CleanupTasks } from "@/lib/db/schema";
import { deleteObject } from "@/lib/storage";

export function cleanupRetryDelayMs(attempts: number): number {
  return Math.min(60 * 60_000, 1_000 * 2 ** Math.min(attempts, 12));
}

export function runOwnsCleanupReservation(status: string | null | undefined): boolean {
  return status === "running" || status === "waiting_approval";
}

export async function enqueueR2Cleanup(
  tenantId: string,
  key: string,
  reason: string,
  opts?: { runId?: string; notBefore?: Date },
): Promise<void> {
  await db
    .insert(r2CleanupTasks)
    .values({ tenantId, key, reason, ...(opts?.runId ? { runId: opts.runId } : {}), ...(opts?.notBefore ? { nextAttemptAt: opts.notBefore } : {}) })
    .onConflictDoNothing();
}

export async function cancelR2Cleanup(key: string): Promise<void> {
  await db.delete(r2CleanupTasks).where(eq(r2CleanupTasks.key, key));
}

export async function rearmR2Cleanup(tenantId: string, key: string, reason: string): Promise<void> {
  await db.update(r2CleanupTasks).set({ reason, nextAttemptAt: new Date(), updatedAt: new Date() }).where(and(eq(r2CleanupTasks.key, key), eq(r2CleanupTasks.tenantId, tenantId)));
}

export async function processR2CleanupTasks(limit = 25): Promise<void> {
  const tasks = await db.query.r2CleanupTasks.findMany({
    where: lte(r2CleanupTasks.nextAttemptAt, new Date()),
    orderBy: (tasks, { asc }) => [asc(tasks.nextAttemptAt)],
    limit,
  });
  for (const task of tasks) {
    if (task.runId) {
      const run = await db.query.flowRuns.findFirst({
        where: and(eq(flowRuns.id, task.runId), eq(flowRuns.tenantId, task.tenantId)),
        columns: { status: true },
      });
      if (runOwnsCleanupReservation(run?.status)) {
        await db
          .update(r2CleanupTasks)
          .set({ nextAttemptAt: new Date(Date.now() + 60_000), updatedAt: new Date() })
          .where(
            and(
              eq(r2CleanupTasks.id, task.id),
              eq(r2CleanupTasks.tenantId, task.tenantId),
              lte(r2CleanupTasks.nextAttemptAt, new Date()),
            ),
          );
        continue;
      }
    }

    // Claim with a renewable lease, then perform external R2 I/O without a
    // database transaction or row lock. A crashed cleaner becomes retryable.
    const leaseUntil = new Date(Date.now() + 5 * 60_000);
    const [claimed] = await db
      .update(r2CleanupTasks)
      .set({
        attempts: task.attempts + 1,
        nextAttemptAt: leaseUntil,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(r2CleanupTasks.id, task.id),
          eq(r2CleanupTasks.tenantId, task.tenantId),
          eq(r2CleanupTasks.attempts, task.attempts),
          lte(r2CleanupTasks.nextAttemptAt, new Date()),
        ),
      )
      .returning({ id: r2CleanupTasks.id });
    if (!claimed) continue;

    try {
      await deleteObject(task.key);
      await db
        .delete(r2CleanupTasks)
        .where(
          and(
            eq(r2CleanupTasks.id, task.id),
            eq(r2CleanupTasks.tenantId, task.tenantId),
            eq(r2CleanupTasks.nextAttemptAt, leaseUntil),
          ),
        );
    } catch (error) {
      const attempts = task.attempts + 1;
      await db
        .update(r2CleanupTasks)
        .set({
          lastError: error instanceof Error ? error.message : String(error),
          nextAttemptAt: new Date(Date.now() + cleanupRetryDelayMs(attempts)),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(r2CleanupTasks.id, task.id),
            eq(r2CleanupTasks.tenantId, task.tenantId),
            eq(r2CleanupTasks.nextAttemptAt, leaseUntil),
          ),
        );
    }
  }
}
