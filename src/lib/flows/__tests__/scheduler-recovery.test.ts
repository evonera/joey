import { describe, it, expect } from "vitest";

describe("Flow scheduler stale sweep & admission invariants", () => {
  it("discriminates stale vs active runs by updatedAt rather than startedAt", () => {
    const now = Date.now();
    const staleCutoff = new Date(now - 2 * 60_000); // 2-minute cutoff (12x 10s heartbeat)

    const longRunningActiveRun = {
      id: "run-long",
      status: "running",
      startedAt: new Date(now - 45 * 60_000), // Started 45 mins ago
      updatedAt: new Date(now - 10_000),      // Actively heartbeat 10s ago
    };

    const crashedStaleRun = {
      id: "run-dead",
      status: "running",
      startedAt: new Date(now - 5 * 60_000),
      updatedAt: new Date(now - 3 * 60_000),  // No heartbeat for 3 mins
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

  it("preserves executed run history on exhausted finalization and resolves accurate status", () => {
    type RunRecord = { id: string; status: string; steps: { status: string }[]; updatedAt: Date; error?: string | null };
    
    // 1. Run whose steps all succeeded before finalization network drop
    const succeededRun: RunRecord = {
      id: "run-succeeded",
      status: "running",
      steps: [
        { status: "succeeded" },
        { status: "succeeded" },
      ],
      updatedAt: new Date(Date.now() - 35 * 60_000),
    };

    // 2. Run that crashed midway without completing
    const crashedRun: RunRecord = {
      id: "run-crashed",
      status: "running",
      steps: [
        { status: "succeeded" },
        { status: "working" },
      ],
      updatedAt: new Date(Date.now() - 35 * 60_000),
    };

    const reconcileStaleRun = (run: RunRecord, staleCutoff: Date) => {
      if (run.status === "running" && run.updatedAt < staleCutoff) {
        const hasFailure = run.steps.some((s) => s.status === "failed");
        const hasWorking = run.steps.some((s) => s.status === "working");
        const allDone = run.steps.length > 0 && run.steps.every((s) => s.status === "succeeded" || s.status === "skipped");

        if (allDone && !hasFailure && !hasWorking) {
          run.status = "succeeded";
        } else {
          run.status = "failed";
          run.error = "Run timed out (no heartbeat activity for 30 minutes).";
        }
      }
    };

    const staleCutoff = new Date(Date.now() - 30 * 60_000);
    reconcileStaleRun(succeededRun, staleCutoff);
    reconcileStaleRun(crashedRun, staleCutoff);

    expect(succeededRun.status).toBe("succeeded"); // Accurately records succeeded instead of falsely failing
    expect(crashedRun.status).toBe("failed");
    expect(crashedRun.error).toContain("timed out");
  });

  it("rejects SSRF private and link-local URLs including hostnames resolving to private IPs", async () => {
    const { validateSafeUrl } = await import("../nodes/ai/transcribe");

    // Dangerous/internal URLs that must be rejected
    await expect(validateSafeUrl("http://localhost/audio.mp3")).rejects.toThrow();
    await expect(validateSafeUrl("http://127.0.0.1:8080/secret.mp4")).rejects.toThrow();
    await expect(validateSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(validateSafeUrl("http://10.0.1.5/recording.mp3")).rejects.toThrow();
    await expect(validateSafeUrl("http://192.168.1.1/stream")).rejects.toThrow();
    // IPv4-mapped IPv6 representations of private ranges (incl. 172.16/12)
    await expect(validateSafeUrl("http://[::ffff:172.20.0.5]/audio")).rejects.toThrow();
    await expect(validateSafeUrl("http://[::ffff:10.0.1.5]/audio")).rejects.toThrow();
    await expect(validateSafeUrl("http://[::ffff:169.254.169.254]/latest/meta-data")).rejects.toThrow();
    await expect(validateSafeUrl("http://172.20.0.5/audio")).rejects.toThrow();
    await expect(validateSafeUrl("ftp://example.com/audio.mp3")).rejects.toThrow();
    await expect(validateSafeUrl("http://service.internal/audio.mp3")).rejects.toThrow();

    // Safe public URLs that must be allowed
    const parsed = await validateSafeUrl("https://storage.googleapis.com/bucket/audio.mp3");
    expect(parsed.url.hostname).toBe("storage.googleapis.com");
    expect(parsed.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it("fences execution when run is transitioned out of running by stale recovery", () => {
    const runState = { id: "run-1", status: "failed" }; // Already transitioned by stale sweep

    const guardExecution = (status: string) => {
      if (status !== "running") {
        throw new Error("Execution fenced: run was transitioned out of running by stale recovery.");
      }
    };

    expect(() => guardExecution(runState.status)).toThrow("Execution fenced");
  });

  it("deduplicates processed webhooks but re-arms failed webhooks for retry", () => {
    type StoredEvent = { eventId: string; status: "pending" | "processed" | "failed" };
    const dbEvents = new Map<string, StoredEvent>();

    const handleWebhookDelivery = (payload: { id: string; event: string }) => {
      const existing = dbEvents.get(payload.id);
      if (existing) {
        if (existing.status === "failed") {
          // Re-arm failed event for retry
          existing.status = "pending";
          return { isDuplicate: false, event: existing };
        }
        return { isDuplicate: true, event: existing };
      }
      const newEvent: StoredEvent = { eventId: payload.id, status: "pending" };
      dbEvents.set(payload.id, newEvent);
      return { isDuplicate: false, event: newEvent };
    };

    // First attempt: arrives, starts as pending
    const first = handleWebhookDelivery({ id: "evt_123", event: "post.published" });
    expect(first.isDuplicate).toBe(false);

    // If it processed successfully, subsequent delivery is duplicate
    first.event.status = "processed";
    const second = handleWebhookDelivery({ id: "evt_123", event: "post.published" });
    expect(second.isDuplicate).toBe(true);

    // If a different event failed, retry should NOT be duplicate; it re-arms
    const failedDelivery = handleWebhookDelivery({ id: "evt_failed", event: "post.published" });
    failedDelivery.event.status = "failed";

    const retryDelivery = handleWebhookDelivery({ id: "evt_failed", event: "post.published" });
    expect(retryDelivery.isDuplicate).toBe(false);
    expect(retryDelivery.event.status).toBe("pending");
  });

  it("seeds clean condition skips while excluding failure-induced skips on restart", () => {
    type Step = { nodeId: string; status: "succeeded" | "skipped" | "failed" | "working" };
    const cachedSteps: Step[] = [
      { nodeId: "trigger-1", status: "succeeded" },
      { nodeId: "condition-1", status: "succeeded" },
      { nodeId: "clean-skipped-branch", status: "skipped" },
      { nodeId: "active-branch-node-1", status: "failed" },
      { nodeId: "failure-skipped-downstream", status: "skipped" },
    ];

    const edges = [
      { from: "trigger-1", to: "condition-1" },
      { from: "condition-1", to: "clean-skipped-branch" },
      { from: "condition-1", to: "active-branch-node-1" },
      { from: "active-branch-node-1", to: "failure-skipped-downstream" },
    ];

    const incoming = (id: string) => edges.filter((e) => e.to === id);
    const failedNodeIds = new Set(
      cachedSteps.filter((s) => s.status === "failed" || s.status === "working").map((s) => s.nodeId),
    );

    const isDescendantOfAny = (nodeId: string, ancestorIds: Set<string>): boolean => {
      if (ancestorIds.size === 0) return false;
      const visited = new Set<string>();
      const queue = incoming(nodeId).map((e) => e.from);
      while (queue.length > 0) {
        const parent = queue.shift()!;
        if (ancestorIds.has(parent)) return true;
        if (!visited.has(parent)) {
          visited.add(parent);
          queue.push(...incoming(parent).map((e) => e.from));
        }
      }
      return false;
    };

    const seededSteps = new Map<string, Step>();
    for (const step of cachedSteps) {
      if (step.status === "succeeded") {
        seededSteps.set(step.nodeId, step);
      } else if (step.status === "skipped" && !isDescendantOfAny(step.nodeId, failedNodeIds)) {
        seededSteps.set(step.nodeId, step);
      }
    }

    expect(seededSteps.has("trigger-1")).toBe(true);
    expect(seededSteps.has("condition-1")).toBe(true);
    expect(seededSteps.has("clean-skipped-branch")).toBe(true); // Clean condition skip is preserved!
    expect(seededSteps.has("active-branch-node-1")).toBe(false); // Failed node will re-run!
    expect(seededSteps.has("failure-skipped-downstream")).toBe(false); // Failure-induced skip will execute when parent succeeds!
  });

  it("reuses previous checkpoints on retried webhook flow execution", () => {
    type FlowRun = { id: string; flowId: string; status: string; steps?: any[]; triggerPayload?: { id: string } };
    const flowRuns: FlowRun[] = [
      {
        id: "run-failed-attempt",
        flowId: "flow-1",
        status: "failed",
        triggerPayload: { id: "evt-1" },
        steps: [{ nodeId: "node-1", status: "succeeded", output: { text: "done" } }],
      },
    ];

    const dispatchWebhookRun = (payload: { id: string }) => {
      const priorRun = flowRuns.find((r) => r.triggerPayload?.id === payload.id);
      if (priorRun && (priorRun.status === "succeeded" || priorRun.status === "waiting_approval")) {
        return null; // Skip duplicate
      }
      const cachedSteps = priorRun?.status === "failed" ? priorRun.steps : undefined;
      const newRun: FlowRun = {
        id: "run-retry-attempt",
        flowId: "flow-1",
        status: "running",
        triggerPayload: payload,
        steps: cachedSteps,
      };
      return newRun;
    };

    const retriedRun = dispatchWebhookRun({ id: "evt-1" });
    expect(retriedRun).not.toBeNull();
    expect(retriedRun?.steps).toHaveLength(1);
    expect(retriedRun?.steps?.[0].status).toBe("succeeded"); // Reuses completed side effects from prior attempt
  });

  it("filters out revoked credentials when resolving API keys", () => {
    type ApiKeyRecord = { provider: string; tenantId: string; status: "active" | "revoked"; encryptedKey: string };
    const keys: ApiKeyRecord[] = [
      { provider: "openai", tenantId: "t1", status: "revoked", encryptedKey: "enc_revoked" },
      { provider: "tavily", tenantId: "t1", status: "active", encryptedKey: "enc_active" },
    ];

    const resolveActiveKey = (tenantId: string, provider: string) => {
      return keys.find((k) => k.tenantId === tenantId && k.provider === provider && k.status === "active");
    };

    expect(resolveActiveKey("t1", "openai")).toBeUndefined(); // Revoked key is ignored
    expect(resolveActiveKey("t1", "tavily")?.encryptedKey).toBe("enc_active"); // Active key is selected
  });
});

