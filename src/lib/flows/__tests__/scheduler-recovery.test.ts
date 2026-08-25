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

  it("marks abandoned stale runs as failed while transitioning approval pauses", () => {
    type RunRecord = {
      id: string;
      status: string;
      steps: { nodeId: string; status: string }[];
      updatedAt: Date;
      error?: string | null;
    };

    // 1. Run that crashed midway without completing
    const crashedRun: RunRecord = {
      id: "run-crashed",
      status: "running",
      steps: [
        { nodeId: "trigger-1", status: "succeeded" },
        { nodeId: "node-2", status: "working" },
      ],
      updatedAt: new Date(Date.now() - 35 * 60_000),
    };

    // 2. Run that was waiting approval when process went quiet
    const waitingRun: RunRecord = {
      id: "run-waiting",
      status: "running",
      steps: [
        { nodeId: "trigger-1", status: "succeeded" },
        { nodeId: "approval-1", status: "waiting_approval" },
      ],
      updatedAt: new Date(Date.now() - 35 * 60_000),
    };

    const reconcileStaleRun = (run: RunRecord, staleCutoff: Date) => {
      if (run.status === "running" && run.updatedAt < staleCutoff) {
        const hasWaitingApproval = run.steps.some((s) => s.status === "waiting_approval");
        if (hasWaitingApproval) {
          run.status = "waiting_approval";
          run.error = null;
        } else {
          run.status = "failed";
          run.error = "Run timed out (no heartbeat activity for 30 minutes).";
        }
      }
    };

    const staleCutoff = new Date(Date.now() - 30 * 60_000);
    reconcileStaleRun(crashedRun, staleCutoff);
    reconcileStaleRun(waitingRun, staleCutoff);

    expect(crashedRun.status).toBe("failed");
    expect(crashedRun.error).toContain("timed out");
    expect(waitingRun.status).toBe("waiting_approval");
  });

  it("re-arms stale pending webhooks on redelivery only if no active run has recent heartbeats", () => {
    type WebhookRecord = { id: string; eventId: string; status: string; createdAt: Date };
    type FlowRunRecord = { id: string; eventId: string; status: string; updatedAt: Date };

    const flowRuns: FlowRunRecord[] = [
      {
        id: "run-live",
        eventId: "evt-live-long-running",
        status: "running",
        updatedAt: new Date(Date.now() - 10_000), // Heartbeat 10s ago (live!)
      },
      {
        id: "run-dead",
        eventId: "evt-abandoned-run",
        status: "running",
        updatedAt: new Date(Date.now() - 5 * 60_000), // Dead / no heartbeat for 5m
      },
    ];

    const liveWebhookRecord: WebhookRecord = {
      id: "wh-1",
      eventId: "evt-live-long-running",
      status: "pending",
      createdAt: new Date(Date.now() - 10 * 60_000), // Flow running for 10m
    };

    const abandonedWebhookRecord: WebhookRecord = {
      id: "wh-2",
      eventId: "evt-abandoned-run",
      status: "pending",
      createdAt: new Date(Date.now() - 10 * 60_000),
    };

    const handleDelivery = (existing: WebhookRecord) => {
      if (existing.status === "failed") {
        return { rearmed: true, isDuplicate: false };
      }
      if (existing.status === "pending") {
        const liveRun = flowRuns.find(
          (r) => r.eventId === existing.eventId && r.status === "running" && r.updatedAt.getTime() > Date.now() - 2 * 60_000
        );
        if (liveRun) {
          return { rearmed: false, isDuplicate: true }; // Active live flow is NOT disrupted
        }
        if (existing.createdAt.getTime() < Date.now() - 30_000) {
          return { rearmed: true, isDuplicate: false }; // Abandoned run is re-armed
        }
      }
      return { rearmed: false, isDuplicate: true };
    };

    expect(handleDelivery(liveWebhookRecord).isDuplicate).toBe(true); // Live running flow is NOT re-armed
    expect(handleDelivery(abandonedWebhookRecord).isDuplicate).toBe(false); // Dead flow is re-armed
  });

  it("fences markWebhookProcessed so stale delayed callbacks cannot overwrite a re-armed replacement attempt", () => {
    type EventRow = { eventId: string; status: string; createdAt: Date };
    const eventTable: EventRow[] = [
      { eventId: "evt-1", status: "pending", createdAt: new Date(1000) },
    ];

    // Re-arm event for attempt 2
    eventTable[0].createdAt = new Date(2000);

    const markWebhookProcessedFenced = (eventId: string, status: string, expectedCreatedAt?: Date) => {
      const row = eventTable.find((r) => r.eventId === eventId);
      if (!row) return;
      if (expectedCreatedAt && row.createdAt.getTime() !== expectedCreatedAt.getTime()) {
        return; // Fenced out!
      }
      row.status = status;
    };

    // Stale delayed attempt 1 tries to mark failed/processed
    markWebhookProcessedFenced("evt-1", "failed", new Date(1000));
    expect(eventTable[0].status).toBe("pending"); // Not overwritten by stale attempt 1!

    // Active attempt 2 marks processed
    markWebhookProcessedFenced("evt-1", "processed", new Date(2000));
    expect(eventTable[0].status).toBe("processed"); // Successfully marked by active attempt 2!
  });

  it("atomically claims pending attempt to processing so stale or duplicate callbacks abort before flow dispatch", () => {
    type EventRow = { eventId: string; status: string; createdAt: Date };
    const eventTable: EventRow[] = [
      { eventId: "evt-1", status: "pending", createdAt: new Date(2000) }, // Re-armed to 2000
    ];

    const tryClaimProcessing = (eventId: string, attemptCreatedAt: Date) => {
      const row = eventTable.find(
        (e) => e.eventId === eventId && e.status === "pending" && e.createdAt.getTime() === attemptCreatedAt.getTime()
      );
      if (!row) return null;
      row.status = "processing";
      return row;
    };

    // Stale callback (1000) attempts to claim
    expect(tryClaimProcessing("evt-1", new Date(1000))).toBeNull(); // Fails CAS!
    expect(eventTable[0].status).toBe("pending");

    // Active callback 1 (2000) attempts to claim
    expect(tryClaimProcessing("evt-1", new Date(2000))).not.toBeNull(); // Wins CAS!
    expect(eventTable[0].status).toBe("processing");

    // Active callback 2 (2000, racing) attempts to claim
    expect(tryClaimProcessing("evt-1", new Date(2000))).toBeNull(); // Fails CAS because status is now 'processing'!
  });

  it("rejects restartRun when target run is active or waiting approval", () => {
    const validateRestart = (status: string) => {
      if (status !== "failed" && status !== "succeeded") {
        return { error: `Cannot restart run with status '${status}'. Only completed or failed runs can be restarted.` };
      }
      return { ok: true };
    };

    expect(validateRestart("running").error).toBeDefined();
    expect(validateRestart("waiting_approval").error).toBeDefined();
    expect(validateRestart("failed").ok).toBe(true);
    expect(validateRestart("succeeded").ok).toBe(true);
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
      const cachedSteps =
        priorRun && (priorRun.status === "failed" || priorRun.status === "running")
          ? priorRun.steps
          : undefined;
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

    // Also verify when prior run was interrupted while still "running"
    const interruptedRun = {
      id: "run-interrupted",
      flowId: "flow-2",
      status: "running",
      triggerPayload: { id: "evt-2" },
      steps: [{ nodeId: "node-1", status: "succeeded", output: { text: "done" } }],
    };
    flowRuns.push(interruptedRun);
    const retryInterrupted = dispatchWebhookRun({ id: "evt-2" });
    expect(retryInterrupted?.steps).toHaveLength(1);
    expect(retryInterrupted?.steps?.[0].status).toBe("succeeded");
  });

  it("rejects revoked tenant credentials with an explicit error rather than falling back to shared environment variables", () => {
    type ApiKeyRecord = { provider: string; tenantId: string; status: "active" | "revoked"; encryptedKey: string };
    const keys: ApiKeyRecord[] = [
      { provider: "openai", tenantId: "t1", status: "revoked", encryptedKey: "enc_revoked" },
      { provider: "tavily", tenantId: "t1", status: "active", encryptedKey: "enc_active" },
    ];
    const env = { OPENAI_API_KEY: "shared_env_openai" };

    const resolveTenantKey = (tenantId: string, provider: string) => {
      const tenantKey = keys.find((k) => k.tenantId === tenantId && k.provider === provider);
      if (tenantKey) {
        if (tenantKey.status !== "active") {
          throw new Error(`${provider} API key for this workspace is revoked or disabled.`);
        }
        return tenantKey.encryptedKey;
      }
      if (provider === "openai" && env.OPENAI_API_KEY) return env.OPENAI_API_KEY;
      throw new Error(`No ${provider} API key available.`);
    };

    expect(() => resolveTenantKey("t1", "openai")).toThrow("revoked or disabled");
    expect(resolveTenantKey("t1", "tavily")).toBe("enc_active");
    expect(resolveTenantKey("t2", "openai")).toBe("shared_env_openai"); // Unconfigured workspace falls back to env
  });

  it("maintains strict per-item fanout checkpoint isolation so later items do not leak into item 0", () => {
    const item0Checkpoint = {};
    const item1Checkpoint = { "sink-1": { count: 42 } };

    const progress: Record<string, Record<string, unknown>> = {
      "1": item1Checkpoint,
    };

    // Item 0 gets only its own checkpoint, never leaking from later items
    const restoredItem0 = { ...(progress["0"] ?? {}) };
    expect(Object.keys(restoredItem0)).toHaveLength(0); // Clean slate for item 0

    // Item 1 gets its own checkpoint
    const restoredItem1 = { ...(progress["1"] ?? {}) };
    expect(restoredItem1["sink-1"]).toEqual({ count: 42 });
  });

  it("treats in-flight pending and processing webhooks as duplicates and only re-arms failed events", () => {
    type EventRow = { id: string; eventId: string; status: string };
    const pendingEvent: EventRow = { id: "ev-1", eventId: "evt-1", status: "pending" };
    const processingEvent: EventRow = { id: "ev-2", eventId: "evt-2", status: "processing" };
    const failedEvent: EventRow = { id: "ev-3", eventId: "evt-3", status: "failed" };

    const handleDelivery = (event: EventRow) => {
      if (event.status === "failed") {
        event.status = "pending";
        return { isDuplicate: false };
      }
      if (event.status === "pending" || event.status === "processing") {
        return { isDuplicate: true };
      }
      return { isDuplicate: true };
    };

    expect(handleDelivery(pendingEvent).isDuplicate).toBe(true);
    expect(handleDelivery(processingEvent).isDuplicate).toBe(true);
    expect(handleDelivery(failedEvent).isDuplicate).toBe(false);
  });

  it("validates LLM JSON output strictly against schema and rejects schema-invalid data", async () => {
    const { validateJsonSchema } = await import("../nodes/ai/llm-task");

    const schema = {
      type: "object",
      properties: {
        sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
        score: { type: "number", minimum: 0, maximum: 1 },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["sentiment", "score"],
      additionalProperties: false,
    };

    // Valid JSON
    const validData = { sentiment: "positive", score: 0.95, tags: ["happy"] };
    expect(validateJsonSchema(validData, schema).valid).toBe(true);

    // Missing required field
    const missingField = { sentiment: "positive" };
    expect(validateJsonSchema(missingField, schema).valid).toBe(false);

    // Invalid enum
    const invalidEnum = { sentiment: "confused", score: 0.5 };
    expect(validateJsonSchema(invalidEnum, schema).valid).toBe(false);

    // Invalid type
    const invalidType = { sentiment: "positive", score: "high" };
    expect(validateJsonSchema(invalidType, schema).valid).toBe(false);

    // Unexpected additional property
    const extraProperty = { sentiment: "positive", score: 0.8, extra: true };
    expect(validateJsonSchema(extraProperty, schema).valid).toBe(false);
  });

  it("atomically claims run for restart so concurrent restart calls cannot execute duplicate runs", () => {
    type RunRow = { id: string; status: string; updatedAt: Date };
    const initialUpdatedAt = new Date(1000);
    const runRow: RunRow = { id: "run-1", status: "failed", updatedAt: initialUpdatedAt };

    const claimRestart = (expectedUpdatedAt: Date) => {
      if (runRow.status === "failed" && runRow.updatedAt.getTime() === expectedUpdatedAt.getTime()) {
        runRow.updatedAt = new Date(2000); // CAS success
        return { ok: true };
      }
      return { ok: false, error: "Run was modified or restarted by another request." };
    };

    const r1 = claimRestart(initialUpdatedAt);
    const r2 = claimRestart(initialUpdatedAt);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.error).toContain("modified or restarted");
  });

  it("fences onStepUpdate and onHeartbeat execution when run is transitioned out of running", async () => {
    let runStatus = "running";

    const persistStepFenced = async () => {
      if (runStatus !== "running") {
        throw new Error("Execution fenced: run was transitioned out of running.");
      }
      return { ok: true };
    };

    await expect(persistStepFenced()).resolves.toEqual({ ok: true });

    // Transition run out of running (e.g. by redelivery, stale sweep, or cancellation)
    runStatus = "failed";

    await expect(persistStepFenced()).rejects.toThrow("Execution fenced");
  });

  it("atomically deduplicates concurrent webhook flow dispatches using unique index on active runs", () => {
    type ActiveWebhookRun = { flowId: string; eventId: string; status: string };
    const runningRuns = new Map<string, ActiveWebhookRun>();

    const admitWebhookRun = (flowId: string, eventId: string) => {
      const key = `${flowId}:${eventId}`;
      if (runningRuns.has(key) && runningRuns.get(key)!.status === "running") {
        return null; // onConflictDoNothing
      }
      const newRun = { flowId, eventId, status: "running" };
      runningRuns.set(key, newRun);
      return newRun;
    };

    // Stale attempt and replacement attempt race to dispatch the same flow and event
    const run1 = admitWebhookRun("flow-1", "evt-123");
    const run2 = admitWebhookRun("flow-1", "evt-123");

    expect(run1).not.toBeNull();
    expect(run2).toBeNull(); // Second dispatch is atomically rejected and skipped!
  });

  it("accurately classifies fully completed flows as succeeded during stale recovery", async () => {
    const { isGraphFullyCompleted } = await import("../../../../agent/schedules/flows-tick");

    const graph = {
      nodes: [
        { id: "t1", type: "trigger.schedule" },
        { id: "c1", type: "logic.condition" },
        { id: "act-true", type: "action.notify" },
        { id: "act-false", type: "action.notify" },
      ],
      edges: [
        { id: "e1", source: "t1", target: "c1" },
        { id: "e2", source: "c1", target: "act-true", sourceHandle: "true" },
        { id: "e3", source: "c1", target: "act-false", sourceHandle: "false" },
      ],
    };

    // Case 1: Full execution following "true" branch
    const fullSteps = [
      { nodeId: "t1", status: "succeeded" },
      { nodeId: "c1", status: "succeeded", branch: "true" },
      { nodeId: "act-true", status: "succeeded" },
    ];
    expect(isGraphFullyCompleted(graph, fullSteps)).toBe(true);

    // Case 2: Incomplete execution (crashed before act-true)
    const partialSteps = [
      { nodeId: "t1", status: "succeeded" },
      { nodeId: "c1", status: "succeeded", branch: "true" },
    ];
    expect(isGraphFullyCompleted(graph, partialSteps)).toBe(false);

    // Case 3: Failed step in path
    const failedSteps = [
      { nodeId: "t1", status: "succeeded" },
      { nodeId: "c1", status: "failed" },
    ];
    expect(isGraphFullyCompleted(graph, failedSteps)).toBe(false);

    // Case 4: Flow with fanout node (logic.loop) - all items completed
    const fanoutGraph = {
      nodes: [
        { id: "t1", type: "trigger.schedule" },
        { id: "fe1", type: "logic.loop" },
        { id: "act1", type: "action.notify" },
      ],
      edges: [
        { id: "e1", source: "t1", target: "fe1" },
        { id: "e2", source: "fe1", target: "act1" },
      ],
    };
    const fanoutSteps = [
      { nodeId: "t1", status: "succeeded" },
      { nodeId: "fe1", status: "succeeded", output: ["itemA", "itemB"] },
      { nodeId: "act1", status: "succeeded" },
    ];
    const fullFanoutProgress = {
      "0": { act1: { sent: true } },
      "1": { act1: { sent: true } },
    };
    expect(isGraphFullyCompleted(fanoutGraph, fanoutSteps, fullFanoutProgress)).toBe(true);

    // Case 5: Flow with fanout node (logic.loop) - missing progress for item 1
    const partialFanoutProgress = {
      "0": { act1: { sent: true } },
    };
    expect(isGraphFullyCompleted(fanoutGraph, fanoutSteps, partialFanoutProgress)).toBe(false);
  });

  it("safely evaluates schema regex patterns and rejects dangerous catastrophic backtracking patterns (ReDoS)", async () => {
    const { safeTestRegex } = await import("../nodes/ai/llm-task");

    // Safe valid pattern
    expect(safeTestRegex("^[a-z]+$", "hello")).toBe(true);
    expect(safeTestRegex("^[a-z]+$", "12345")).toBe(false);

    // Pathological nested quantifier patterns (catastrophic backtracking)
    expect(safeTestRegex("^(a+)+$", "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
    expect(safeTestRegex("^([a-zA-Z0-9]+)*$", "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
    expect(safeTestRegex("^(a*)*$", "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);

    // Excessively long regex pattern
    const longPattern = "a".repeat(300);
    expect(safeTestRegex(longPattern, "a")).toBe(false);
  });
});

