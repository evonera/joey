import { afterEach, describe, expect, it, vi } from "vitest";
import { operationalEvent, sanitizeOperationalContext } from "@/lib/operations-log";

describe("operational logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("removes secrets and payload-like fields", () => {
    expect(sanitizeOperationalContext({
      tenantId: "tenant-1",
      webhookSecret: "secret",
      authorization: "Bearer token",
      payload: "private body",
    })).toEqual({ tenantId: "tenant-1" });
  });

  it("emits machine-readable events with bounded errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    operationalEvent("error", "flow_run.failed", {
      tenantId: "tenant-1",
      runId: "run-1",
      error: "x".repeat(800),
    });
    const record = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(record.event).toBe("flow_run.failed");
    expect(record.tenantId).toBe("tenant-1");
    expect(record.error).toHaveLength(500);
    expect(record.timestamp).toBeTypeOf("string");
  });

  it("redacts sensitive substrings embedded within error messages", () => {
    const sanitized = sanitizeOperationalContext({
      error: "Request failed with Bearer secret123 and token=my-token-val and https://user:pwd@db.host/name",
    });
    expect(sanitized.error).toContain("Bearer [REDACTED]");
    expect(sanitized.error).toContain("token=[REDACTED]");
    expect(sanitized.error).toContain("https://[REDACTED]:[REDACTED]@db.host/name");
    expect(sanitized.error).not.toContain("secret123");
    expect(sanitized.error).not.toContain("my-token-val");
    expect(sanitized.error).not.toContain("pwd");
  });
});
