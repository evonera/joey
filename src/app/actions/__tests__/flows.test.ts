import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mockFindFlow = vi.fn();
const mockUpdateFlow = vi.fn();
const mockRequireRole = vi.fn(async () => "tenant_1");

vi.mock("@/lib/db", () => ({
  db: {
    query: { flows: { findFirst: mockFindFlow }, apiKeys: { findMany: vi.fn(async () => []) }, socialAccounts: { findMany: vi.fn(async () => []) } },
    update: mockUpdateFlow,
  },
}));

vi.mock("@/lib/auth", () => ({
  getActiveTenantId: vi.fn(async () => "tenant_1"),
  requireRole: mockRequireRole,
}));
vi.mock("@/lib/flows/validation", () => ({
  parseGraphDoc: (raw: unknown) => raw,
  validateGraph: () => ({ ok: true, issues: [] }),
}));

describe("saveFlow concurrency handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue("tenant_1");
    mockFindFlow.mockResolvedValue({
      id: "flow_1",
      tenantId: "tenant_1",
      status: "draft",
      executionRevision: 7,
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

  it("returns handled authorization errors for run approval and restart actions", async () => {
    const { resumeRun, restartRun, setFlowStatus, publishTemplate } = await import("@/app/actions/flows");
    mockRequireRole.mockRejectedValueOnce(new Error("Forbidden: Action requires role owner or admin"));
    await expect(resumeRun("run-1", true)).resolves.toEqual({
      error: "Forbidden: Action requires role owner or admin",
    });

    mockRequireRole.mockRejectedValueOnce(new Error("Forbidden: Action requires role owner or admin"));
    await expect(restartRun("run-1")).resolves.toEqual({
      error: "Forbidden: Action requires role owner or admin",
    });

    mockRequireRole.mockRejectedValueOnce(new Error("Forbidden: Action requires role owner or admin"));
    await expect(setFlowStatus("flow_1", "active")).resolves.toEqual({
      error: "Forbidden: Action requires role owner or admin",
    });

    mockRequireRole.mockRejectedValueOnce(new Error("Forbidden: Action requires role owner or admin"));
    await expect(publishTemplate("flow_1", { name: "Template" })).resolves.toEqual({
      error: "Forbidden: Action requires role owner or admin",
    });
  });
  it("keeps both draft-status and checked-revision fences during activation", async () => {
    const where = vi.fn((_condition: SQL) => ({ returning: vi.fn(async () => [{ id: "flow_1" }]) }));
    mockUpdateFlow.mockReturnValue({ set: vi.fn(() => ({ where })) });
    const { setFlowStatus } = await import("@/app/actions/flows");
    await expect(setFlowStatus("flow_1", "active")).resolves.toEqual({ ok: true });
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(expect.arrayContaining(["draft", 7]));
  });
  it("does not accept an activation whose validated graph revision changed", async () => {
    mockUpdateFlow.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => []) })) })) });
    mockFindFlow.mockResolvedValueOnce({ id: "flow_1", tenantId: "tenant_1", status: "draft", executionRevision: 7, graph: { nodes: [], edges: [] } });
    mockFindFlow.mockResolvedValueOnce({ status: "active", executionRevision: 8 });
    const { setFlowStatus } = await import("@/app/actions/flows");
    await expect(setFlowStatus("flow_1", "active")).resolves.toEqual({ error: "This flow changed while activation was checked. Review it and try again." });
  });
});
