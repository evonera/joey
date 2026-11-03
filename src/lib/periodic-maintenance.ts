import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimitCounters } from "@/lib/db/schema";
import { operationalEvent } from "@/lib/operations-log";

type Task = { name: string; minutes: number; run: () => Promise<unknown> };

/** Durable per-window admission, shared by HTTP cron and Eve schedules. */
export async function runPeriodicMaintenance(tasks: Task[], now = new Date()) {
  if (!tasks.length) return [];
  const windows = tasks.map(task => ({
    tokenId: `internal:maintenance:${task.name}`,
    windowStart: new Date(Math.floor(now.getTime() / (task.minutes * 60_000)) * task.minutes * 60_000),
    count: 1,
  }));
  // One batched round trip, including for windows already handled by another instance.
  const admitted = await db.insert(rateLimitCounters).values(windows).onConflictDoNothing()
    .returning({ tokenId: rateLimitCounters.tokenId });
  const owned = new Set(admitted.map(row => row.tokenId));
  type Result = { task: string; status: "fulfilled" | "failed" | "skipped" };
  // Explicit promise chain preserves the dependency of cleanup on stale-run reconciliation.
  return tasks.reduce<Promise<Result[]>>((previous, task, index) => previous.then(async results => {
    const window = windows[index];
    if (!owned.has(window.tokenId)) { results.push({ task: task.name, status: "skipped" }); return results; }
    try {
      const result = await task.run();
      if (result && typeof result === "object" && (
        ("failed" in result && typeof result.failed === "number" && result.failed > 0) ||
        ("error" in result && Boolean(result.error))
      )) throw new Error("Maintenance task reported failed operations");
      results.push({ task: task.name, status: "fulfilled" });
    } catch (error) {
      results.push({ task: task.name, status: "failed" });
      operationalEvent("error", "maintenance.task_failed", {
        task: task.name, error: error instanceof Error ? error.message : String(error),
      });
      // A handled failure is retryable on the next tick, not hidden until the next window.
      try {
        await db.delete(rateLimitCounters).where(and(
          eq(rateLimitCounters.tokenId, window.tokenId), eq(rateLimitCounters.windowStart, window.windowStart),
        ));
      } catch (releaseError) {
        operationalEvent("error", "maintenance.retry_release_failed", {
          task: task.name, error: releaseError instanceof Error ? releaseError.message : String(releaseError),
        });
      }
    }
    // These are admission receipts, not task locks: processors retain their own
    // idempotency/leases. A process crash retries at the next bounded window.
    return results;
  }), Promise.resolve([]));
}
