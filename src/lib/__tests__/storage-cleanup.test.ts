import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFindTasks = vi.fn();
const mockReturning = vi.fn();
const mockLimit = vi.fn();
const mockDeleteObject = vi.fn();

function stubChain() {
  const chain: Record<string, any> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = (...args: unknown[]) => mockReturning(...args);
  chain.from = vi.fn(() => chain);
  chain.limit = (...args: unknown[]) => mockLimit(...args);
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      r2CleanupTasks: { findMany: (...args: unknown[]) => mockFindTasks(...args) },
      flowRuns: { findFirst: vi.fn(async () => null) },
    },
    update: vi.fn(() => stubChain()),
    select: vi.fn(() => stubChain()),
    delete: vi.fn(() => stubChain()),
  },
}));

vi.mock("@/lib/storage", () => ({
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
}));

function task(overrides = {}) {
  return {
    id: "task-1",
    tenantId: "t1",
    key: "t1/obj.png",
    runId: null,
    attempts: 0,
    nextAttemptAt: new Date(Date.now() - 1000),
    ...overrides,
  };
}

describe("r2 cleanup reference guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops the task without touching R2 when the key is still referenced", async () => {
    mockFindTasks.mockResolvedValueOnce([task()]);
    mockReturning.mockResolvedValueOnce([{ id: "task-1" }]);
    mockLimit.mockResolvedValueOnce([{ id: "asset-1" }]);

    const { processR2CleanupTasks } = await import("../storage-cleanup");
    await processR2CleanupTasks(25);

    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("deletes the R2 object when no asset row references the key", async () => {
    mockFindTasks.mockResolvedValueOnce([task()]);
    mockReturning.mockResolvedValueOnce([{ id: "task-1" }]);
    mockLimit.mockResolvedValueOnce([]);
    mockDeleteObject.mockResolvedValueOnce({});
    mockReturning.mockResolvedValueOnce([{ id: "task-1" }]);

    const { processR2CleanupTasks } = await import("../storage-cleanup");
    await processR2CleanupTasks(25);

    expect(mockDeleteObject).toHaveBeenCalledOnce();
    expect(mockDeleteObject).toHaveBeenCalledWith("t1/obj.png");
  });
});
