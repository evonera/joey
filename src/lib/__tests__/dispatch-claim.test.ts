import { describe, expect, it, vi, beforeEach } from "vitest";
import { truncateForDispatch, withTimeout } from "../dispatch-claim";

const mockExecute = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

describe("dispatch-claim helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Collects every string fragment inside a drizzle SQL object. */
  function sqlText(arg: unknown): string {
    const parts: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === "string") parts.push(value);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(arg);
    return parts.join(" ");
  }

  it("truncates tenant text bound for agent dispatch", () => {
    expect(truncateForDispatch("short")).toBe("short");
    const long = "x".repeat(2500);
    const truncated = truncateForDispatch(long);
    expect(truncated.length).toBeLessThan(long.length);
    expect(truncated).toContain("truncated");
  });

  it("withTimeout resolves fast tasks", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, "fast")).resolves.toBe(42);
  });

  it("withTimeout rejects slow tasks without hanging", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve(1), 5000));
    await expect(withTimeout(slow, 10, "slow-task")).rejects.toThrow(
      "slow-task timed out after 10ms",
    );
  });

  it("claims engagement dispatches with a single SKIP LOCKED statement", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const { claimEngagementDispatches } = await import("../dispatch-claim");
    await expect(claimEngagementDispatches(20)).resolves.toEqual([]);
    const query = sqlText(mockExecute.mock.calls[0][0]);
    expect(query).toContain("FOR UPDATE");
    expect(query).toContain("SKIP LOCKED");
    expect(query).toContain("dispatching");
  });

  it("claims webhook dispatches with a single SKIP LOCKED statement", async () => {
    mockExecute.mockResolvedValueOnce([]);
    const { claimWebhookDispatches } = await import("../dispatch-claim");
    await expect(claimWebhookDispatches(20)).resolves.toEqual([]);
    const query = sqlText(mockExecute.mock.calls[0][0]);
    expect(query).toContain("FOR UPDATE");
    expect(query).toContain("SKIP LOCKED");
  });

  it("maps claimed engagement rows to camelCase", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          id: "e1",
          tenantId: "t1",
          platform: "x",
          text: "hello",
          commenterName: null,
          commenterHandle: "bob",
          platformPostId: null,
        },
      ],
    });
    const { claimEngagementDispatches } = await import("../dispatch-claim");
    await expect(claimEngagementDispatches(5)).resolves.toEqual([
      {
        id: "e1",
        tenantId: "t1",
        platform: "x",
        text: "hello",
        commenterName: null,
        commenterHandle: "bob",
        platformPostId: null,
      },
    ]);
  });
});
