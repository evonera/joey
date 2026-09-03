import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { query: { memories: { findMany: (...args: unknown[]) => mockFindMany(...args) } } },
}));

const ctx = (tenantId: string | null) =>
  ({ session: { auth: { current: { attributes: { tenantId } } } } }) as any;

describe("list_memories tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a tenant session", async () => {
    const tool = (await import("#tools/list_memories")).default as any;
    await expect(tool.execute({ limit: 20, offset: 0, oldestFirst: false }, ctx(null))).rejects.toThrow(
      "Unable to identify tenant",
    );
  });

  it("pages newest-first without ever selecting embeddings", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "m1", content: "a", type: "strategy_insight", metadata: {}, createdAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    const tool = (await import("#tools/list_memories")).default as any;
    const result = await tool.execute({ limit: 20, offset: 40, oldestFirst: false }, ctx("t1"));
    expect(mockFindMany).toHaveBeenCalledOnce();
    const args = mockFindMany.mock.calls[0][0];
    expect(args.limit).toBe(20);
    expect(args.offset).toBe(40);
    expect(args.columns).not.toHaveProperty("embedding");
    expect(result).toEqual({
      memories: [
        { id: "m1", content: "a", type: "strategy_insight", metadata: {}, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      count: 1,
    });
  });
});
