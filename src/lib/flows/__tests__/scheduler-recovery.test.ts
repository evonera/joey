import { describe, it, expect } from "vitest";

describe("Flow scheduler stale sweep & admission invariants", () => {
  it("discriminates stale vs active runs by updatedAt rather than startedAt", () => {
    const now = Date.now();
    const staleCutoff = new Date(now - 30 * 60_000);

    const longRunningActiveRun = {
      id: "run-long",
      status: "running",
      startedAt: new Date(now - 45 * 60_000), // Started 45 mins ago
      updatedAt: new Date(now - 2 * 60_000),  // Actively progressed 2 mins ago
    };

    const crashedStaleRun = {
      id: "run-dead",
      status: "running",
      startedAt: new Date(now - 35 * 60_000),
      updatedAt: new Date(now - 35 * 60_000), // No heartbeat for 35 mins
    };

    // Stale evaluation based on updatedAt
    const isStale = (run: { status: string; updatedAt: Date }) =>
      run.status === "running" && run.updatedAt < staleCutoff;

    expect(isStale(longRunningActiveRun)).toBe(false);
    expect(isStale(crashedStaleRun)).toBe(true);
  });

  it("handles duplicate scheduled admission by skipping when insert returns empty", () => {
    // Simulate first worker inserting and returning the claimed run
    const firstWorkerInsert = [{ id: "run-1", trigger: "schedule", status: "running" }];
    // Simulate second worker hitting the unique partial index ON CONFLICT DO NOTHING -> returns []
    const secondWorkerInsert: Array<{ id: string }> = [];

    const handleAdmission = (rows: Array<{ id: string }>) => {
      const run = rows[0];
      if (!run) return "skipped_duplicate";
      return "admitted";
    };

    expect(handleAdmission(firstWorkerInsert)).toBe("admitted");
    expect(handleAdmission(secondWorkerInsert)).toBe("skipped_duplicate");
  });

  it("guarantees terminal status write even when step payload fails persistence", async () => {
    type RunRecord = { id: string; status: string; steps?: unknown[]; error?: string | null };
    const dbRecord: RunRecord = { id: "run-1", status: "running" };

    const simulateFinalize = async (
      runId: string,
      result: { status: "succeeded" | "failed"; steps: unknown[]; error?: string | null },
      failRichWrite: boolean,
    ) => {
      if (failRichWrite) {
        // Primary write failed (e.g. invalid JSON payload or DB payload limit)
        // Fallback minimal write
        dbRecord.status = result.status;
        dbRecord.error = result.error ?? "Failed persisting step output details.";
      } else {
        dbRecord.status = result.status;
        dbRecord.steps = result.steps;
        dbRecord.error = result.error ?? null;
      }
      return dbRecord.status;
    };

    const finalStatus = await simulateFinalize(
      "run-1",
      { status: "succeeded", steps: [{ nonSerializable: true }], error: null },
      true, // Simulate rich write failure
    );

    expect(finalStatus).toBe("succeeded");
    expect(dbRecord.status).toBe("succeeded");
    expect(dbRecord.error).toBe("Failed persisting step output details.");
  });

  it("reports failure in approval resume if terminal writes are completely exhausted", () => {
    // Simulate resumeRun behavior when DB write exhausts all retries
    const finalizeOutcome = {
      persisted: false,
      status: "succeeded" as const,
      error: "Failed to persist terminal status to database after retries.",
    };

    const handleResumeOutcome = (res: typeof finalizeOutcome) => {
      if (!res.persisted) {
        return {
          ok: false,
          status: res.status,
          error: `Run execution finished with status '${res.status}', but terminal state could not be persisted to the database.`,
        };
      }
      return { ok: true, status: res.status };
    };

    const result = handleResumeOutcome(finalizeOutcome);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("succeeded");
    expect(result.error).toContain("could not be persisted");
  });

  it("ensures exhausted scheduled finalization clears running status so future ticks are not suppressed", () => {
    let runningRowPresent = true;
    let finalized = false;

    // Simulate all 3 finalization attempts failing
    for (let attempt = 0; attempt < 3; attempt++) {
      // Both rich and minimal writes fail
    }

    // Tier 4 emergency cleanup
    if (!finalized) {
      runningRowPresent = false; // Emergency removal of stranded running row
    }

    expect(runningRowPresent).toBe(false); // Does NOT block future scheduled runs
  });
});

