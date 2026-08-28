import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { r2CleanupTasks } from "@/lib/db/schema";
import { deleteObject } from "@/lib/storage";

export async function enqueueR2Cleanup(
  tenantId: string,
  key: string,
  reason: string,
  opts?: { notBefore?: Date },
): Promise<void> {
  await db.insert(r2CleanupTasks).values({ tenantId, key, reason, ...(opts?.notBefore ? { nextAttemptAt: opts.notBefore } : {}) }).onConflictDoNothing();
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
    try {
      await deleteObject(task.key);
      await db.delete(r2CleanupTasks).where(eq(r2CleanupTasks.id, task.id));
    } catch (error) {
      const attempts = task.attempts + 1;
      const delayMs = Math.min(60 * 60_000, 1_000 * 2 ** Math.min(attempts, 12));
      await db.update(r2CleanupTasks).set({ attempts, lastError: error instanceof Error ? error.message : String(error), nextAttemptAt: new Date(Date.now() + delayMs), updatedAt: new Date() }).where(and(eq(r2CleanupTasks.id, task.id), eq(r2CleanupTasks.attempts, task.attempts)));
    }
  }
}
