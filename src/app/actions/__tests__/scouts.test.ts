import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getActiveTenantId: vi.fn(),
  getActiveTenantMembership: vi.fn(),
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/db", () => ({ db: { update: mocks.update } }));
vi.mock("@/lib/scouts/evaluator", () => ({ evaluateScout: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { toggleScout } from "@/app/actions/scouts";

describe("toggleScout authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue("tenant-1");
    mocks.update.mockReturnValue({
      set: mocks.set.mockReturnValue({ where: mocks.where }),
    });
  });

  it("requires an owner or admin to pause an active Scout", async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(toggleScout("scout-1", false)).rejects.toThrow("Forbidden");

    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows an owner or admin to change Scout activation", async () => {
    await expect(toggleScout("scout-1", false)).resolves.toEqual({ success: true });

    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
