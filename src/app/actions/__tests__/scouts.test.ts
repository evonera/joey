import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getActiveTenantId: vi.fn(),
  getActiveTenantMembership: vi.fn(),
  resolveToken: vi.fn(),
  setup: vi.fn(),
  evaluateScout: vi.fn(),
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
  transaction: (fn: (tx: unknown) => unknown) => fn({ update: mocks.update }),
  update: mocks.update,
  insert: mocks.insert,
  query: { scouts: { findFirst: mocks.findFirst } },
} }));
vi.mock("@/lib/agency/service", () => ({ detachAgencyResource: vi.fn(), guardAgencyScoutChange: vi.fn() }));
vi.mock("@/lib/scouts/evaluator", () => ({ evaluateScout: mocks.evaluateScout }));
vi.mock("@/lib/scouts/data-provider", () => ({ getScoutDataProvider: mocks.resolveToken, getScoutProviderSetup: mocks.setup }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createScout, getScoutSetup, runScoutNow, toggleScout, updateScout } from "@/app/actions/scouts";

afterEach(() => vi.unstubAllEnvs());

const input = { name: "Daily Scout", targetUrl: "https://instagram.com/example", goalCondition: "New popular posts" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveTenantId.mockResolvedValue("tenant-1");
  mocks.getActiveTenantMembership.mockResolvedValue({ tenantId: "tenant-1", role: "member" });
  mocks.requireRole.mockResolvedValue("tenant-1");
  mocks.resolveToken.mockResolvedValue("test-token");
  mocks.setup.mockResolvedValue({ ready: true, provider: "custom", customEnabled: true });
  mocks.findFirst.mockResolvedValue({ id: "scout-1", ...input, platform: "instagram", isActive: false });
  mocks.returning.mockResolvedValue([{ id: "scout-1", isActive: false }]);
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.update.mockReturnValue({ set: mocks.set.mockReturnValue({ where: mocks.where }) });
  mocks.insert.mockReturnValue({ values: mocks.values.mockReturnValue({ returning: mocks.returning }) });
});

describe("toggleScout authorization", () => {
  it("uses the same provider resolver for setup and manual scans", async () => {
    expect(await getScoutSetup()).toEqual({ ready: true, provider: "custom", customEnabled: true });
    expect(mocks.setup).toHaveBeenCalledWith("tenant-1");
    await runScoutNow("scout-1");
    expect(mocks.resolveToken).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ id: "scout-1" }));
    expect(mocks.evaluateScout).toHaveBeenCalledWith("scout-1", { tenantId: "tenant-1", force: true });
    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
  });

  it("blocks live manual scans with no token before evaluating", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_MOCK_SCOUTS", "false");
    mocks.resolveToken.mockRejectedValueOnce(new Error("Missing Apify token"));
    await expect(runScoutNow("scout-1")).rejects.toThrow("Missing Apify token");
    expect(mocks.evaluateScout).not.toHaveBeenCalled();
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

  it("checks the configured provider before activating, but not when pausing", async () => {
    await toggleScout("scout-1", false);
    expect(mocks.resolveToken).not.toHaveBeenCalled();
    mocks.resolveToken.mockRejectedValueOnce(new Error("Missing Apify token"));
    mocks.update.mockClear();
    await expect(toggleScout("scout-1", true)).rejects.toThrow("Missing Apify token");
    expect(mocks.resolveToken).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ id: "scout-1" }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("Scout create and edit safety", () => {
  it.each([0, -1, 14, 1441, 15.5, NaN, Infinity, "120", null])("rejects unsafe interval %s before create or update", async interval => {
    await expect(createScout({ ...input, pollIntervalMinutes: interval as number })).rejects.toThrow("whole number");
    await expect(updateScout("scout-1", { ...input, pollIntervalMinutes: interval as number })).rejects.toThrow("whole number");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("saves public IPv6 web sources using the shared collector rules", async () => {
    await createScout({ ...input, platform: "web", targetUrl: "https://[2606:4700:4700::1111]/page" });
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ targetUrl: "https://[2606:4700:4700::1111]/page" }));
  });

  it.each(["https://instagram.com/" + "a".repeat(2048), "https://127.0.0.1/page", "https://[::1]/page", "https://user:secret@instagram.com/page"])("refuses sources that cannot pass static collection validation: %s", async targetUrl => {
    await expect(createScout({ ...input, platform: "web", targetUrl })).rejects.toThrow("public HTTPS");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
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
