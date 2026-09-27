import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFlow = vi.fn();
const mockUpdateFlow = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    query: { flows: { findFirst: mockFindFlow } },
    update: mockUpdateFlow,
  },
}));

vi.mock("@/lib/auth", () => ({
  getActiveTenantId: vi.fn(async () => "tenant_1"),
  requireRole: vi.fn(async () => "tenant_1"),
}));

describe("saveFlow concurrency handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFlow.mockResolvedValue({
      id: "flow_1",
      tenantId: "tenant_1",
      status: "draft",
      name: "Draft flow",
      graph: { nodes: [], edges: [] },
    });
  });

  it("returns a conflict when the draft-only update loses a race", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    mockUpdateFlow.mockReturnValue({ set: set });

    const { saveFlow } = await import("@/app/actions/flows");
    const result = await saveFlow("flow_1", { name: "Updated name" });

    expect(result).toEqual({
      error: "Flow changed before it could be saved. Refresh and try again.",
    });
    expect(returning).toHaveBeenCalled();
  });

  it("reports success only when the row was updated", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "flow_1" }]);
    const where = vi.fn(() => ({ returning }));
    mockUpdateFlow.mockReturnValue({ set: vi.fn(() => ({ where })) });

    const { saveFlow } = await import("@/app/actions/flows");
    await expect(saveFlow("flow_1", { name: "Updated name" })).resolves.toEqual({ ok: true });
  });
});
