import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getActiveTenantId: vi.fn(),
  getActiveTenantMembership: vi.fn(),
  resolveToken: vi.fn(),
  findFirst: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getActiveTenantId: mocks.getActiveTenantId,
  getActiveTenantMembership: mocks.getActiveTenantMembership,
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/db", () => ({ db: {
  update: mocks.update,
  insert: mocks.insert,
  query: { scouts: { findFirst: mocks.findFirst } },
} }));
vi.mock("@/lib/scouts/evaluator", () => ({ evaluateScout: vi.fn() }));
vi.mock("@/lib/flows/nodes/data/apify-actor", () => ({ resolveToken: mocks.resolveToken }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createScout, toggleScout, updateScout } from "@/app/actions/scouts";

const input = { name: "Daily Scout", targetUrl: "https://instagram.com/example", goalCondition: "New popular posts" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveTenantId.mockResolvedValue("tenant-1");
  mocks.getActiveTenantMembership.mockResolvedValue({ tenantId: "tenant-1", role: "member" });
  mocks.requireRole.mockResolvedValue("tenant-1");
  mocks.resolveToken.mockResolvedValue("test-token");
  mocks.findFirst.mockResolvedValue({ id: "scout-1", ...input, platform: "instagram", isActive: false });
  mocks.returning.mockResolvedValue([{ id: "scout-1", isActive: false }]);
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.update.mockReturnValue({ set: mocks.set.mockReturnValue({ where: mocks.where }) });
  mocks.insert.mockReturnValue({ values: mocks.values.mockReturnValue({ returning: mocks.returning }) });
});

describe("toggleScout authorization", () => {
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

  it("checks Apify before activating, but not when pausing", async () => {
    await toggleScout("scout-1", false);
    expect(mocks.resolveToken).not.toHaveBeenCalled();
    mocks.resolveToken.mockRejectedValueOnce(new Error("Missing Apify token"));
    mocks.update.mockClear();
    await expect(toggleScout("scout-1", true)).rejects.toThrow("Missing Apify token");
    expect(mocks.resolveToken).toHaveBeenCalledWith("tenant-1");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("Scout create and edit safety", () => {
  it("creates a validated daily Scout paused, even when credentials are configured", async () => {
    await createScout({ ...input, pollIntervalMinutes: 120 });
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1", pollIntervalMinutes: 1440, isActive: false,
    }));
    expect(mocks.resolveToken).not.toHaveBeenCalled();
  });

  it("allows members to edit inactive Scouts", async () => {
    await expect(updateScout("scout-1", input)).resolves.toMatchObject({ id: "scout-1" });
  });

  it("rejects member edits to an active Scout", async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...input, isActive: true });
    await expect(updateScout("scout-1", input)).rejects.toThrow("Only workspace admins");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows admins to edit active Scouts", async () => {
    mocks.getActiveTenantMembership.mockResolvedValueOnce({ tenantId: "tenant-1", role: "admin" });
    mocks.findFirst.mockResolvedValueOnce({ ...input, isActive: true });
    await expect(updateScout("scout-1", input)).resolves.toMatchObject({ id: "scout-1" });
  });

  it("does not report success if an inactive Scout changed concurrently", async () => {
    mocks.returning.mockResolvedValueOnce([]);
    await expect(updateScout("scout-1", input)).rejects.toThrow("Scout changed before it could be saved");
  });

  it("refuses foreign or missing Scouts", async () => {
    mocks.findFirst.mockResolvedValueOnce(undefined);
    await expect(updateScout("scout-1", input)).rejects.toThrow("Scout not found");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
