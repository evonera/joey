import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { flowRuns, r2CleanupTasks } from "@/lib/db/schema";
import { deleteObject } from "@/lib/storage";

export async function enqueueR2Cleanup(
  tenantId: string,
  key: string,
  reason: string,
  opts?: { runId?: string },
): Promise<void> {
  await db.insert(r2CleanupTasks).values({ tenantId, key, reason, ...(opts?.runId ? { runId: opts.runId } : {}) }).onConflictDoNothing();
}

export async function cancelR2Cleanup(key: string): Promise<void> {
  await db.delete(r2CleanupTasks).where(eq(r2CleanupTasks.key, key));
}

export async function processR2CleanupTasks(limit = 25): Promise<void> {
  const tasks = await db.query.r2CleanupTasks.findMany({
    where: lte(r2CleanupTasks.nextAttemptAt, new Date()),
    orderBy: (tasks, { asc }) => [asc(tasks.nextAttemptAt)],
    limit,
  });
  for (const task of tasks) {
    // Flow execution owns its reservation until it reaches a terminal state.
    // This avoids fixed expiry races when a valid upload/registration lasts
    // longer than expected; stale-run reconciliation makes abandoned work
    // terminal before cleanup can claim it.
    if (task.runId) {
      const run = await db.query.flowRuns.findFirst({
        where: eq(flowRuns.id, task.runId),
        columns: { status: true },
      });
      if (run?.status === "running" || run?.status === "waiting_approval") {
        await db.update(r2CleanupTasks).set({ nextAttemptAt: new Date(Date.now() + 60_000), updatedAt: new Date() }).where(and(eq(r2CleanupTasks.id, task.id), lte(r2CleanupTasks.nextAttemptAt, new Date())));
        continue;
      }
    }

    // Atomically claim the task with a lease, then perform R2 I/O outside a
    // database transaction. A crashed cleaner leaves the lease to expire.
    const leaseUntil = new Date(Date.now() + 5 * 60_000);
    const [claimed] = await db
      .update(r2CleanupTasks)
      .set({ attempts: task.attempts + 1, nextAttemptAt: leaseUntil, updatedAt: new Date() })
      .where(and(eq(r2CleanupTasks.id, task.id), eq(r2CleanupTasks.attempts, task.attempts), lte(r2CleanupTasks.nextAttemptAt, new Date())))
      .returning({ id: r2CleanupTasks.id });
    if (!claimed) continue;
    try {
      await deleteObject(task.key);
      await db.delete(r2CleanupTasks).where(and(eq(r2CleanupTasks.id, task.id), eq(r2CleanupTasks.nextAttemptAt, leaseUntil)));
    } catch (error) {
      const attempts = task.attempts + 1;
      const delayMs = Math.min(60 * 60_000, 1_000 * 2 ** Math.min(attempts, 12));
      await db.update(r2CleanupTasks).set({ attempts, lastError: error instanceof Error ? error.message : String(error), nextAttemptAt: new Date(Date.now() + delayMs), updatedAt: new Date() }).where(and(eq(r2CleanupTasks.id, task.id), eq(r2CleanupTasks.nextAttemptAt, leaseUntil)));
    }
  }
}
