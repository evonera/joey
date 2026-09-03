import { describe, expect, it, vi, beforeEach } from "vitest";

const mockReturning = vi.fn();
const mockWhere = vi.fn(() => ({ returning: mockReturning }));
const mockDelete: (...args: any[]) => any = vi.fn(() => ({ where: mockWhere }));

vi.mock("@/lib/db", () => ({
  db: { delete: (...args: unknown[]) => mockDelete(...args) },
}));

const ctx = (tenantId: string | null) =>
  ({ session: { auth: { current: { attributes: { tenantId } } } } }) as any;

describe("forget_memory tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a tenant session", async () => {
    const tool = (await import("#tools/forget_memory")).default as any;
    await expect(tool.execute({ id: "m1" }, ctx(null))).rejects.toThrow("Unable to identify tenant");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes exactly one tenant-scoped row", async () => {
    mockReturning.mockResolvedValueOnce([{ id: "m1" }]);
    const tool = (await import("#tools/forget_memory")).default as any;
    await expect(tool.execute({ id: "m1" }, ctx("t1"))).resolves.toEqual({
      id: "m1",
      message: "Memory forgotten.",
    });
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockWhere).toHaveBeenCalledOnce();
    expect(mockReturning).toHaveBeenCalledOnce();
  });

  it("throws when the id is unknown in this workspace", async () => {
    mockReturning.mockResolvedValueOnce([]);
    const tool = (await import("#tools/forget_memory")).default as any;
    await expect(tool.execute({ id: "nope" }, ctx("t1"))).rejects.toThrow(
      "Memory not found in this workspace.",
    );
  });
});
