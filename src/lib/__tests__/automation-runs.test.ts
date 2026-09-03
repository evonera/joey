import { describe, expect, it, vi } from "vitest";
import { recordAutomationRun } from "../automation-runs";

const mockValues = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { insert: vi.fn(() => ({ values: (...args: unknown[]) => mockValues(...args) })) },
}));

describe("automation runs ledger", () => {
  it("records a dispatch run without throwing", async () => {
    mockValues.mockResolvedValueOnce([]);
    await expect(
      recordAutomationRun({ kind: "engagement_dispatch", automationId: "e1", tenantId: "t1", status: "ok" }),
    ).resolves.toBeUndefined();
    expect(mockValues).toHaveBeenCalledOnce();
  });

  it("never fails the caller when the ledger write fails", async () => {
    mockValues.mockRejectedValueOnce(new Error("db down"));
    await expect(
      recordAutomationRun({ kind: "webhook_dispatch", automationId: "w1", tenantId: "t1", status: "error", error: "boom" }),
    ).resolves.toBeUndefined();
  });
});
