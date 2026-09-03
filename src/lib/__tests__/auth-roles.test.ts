import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      member: {
        findFirst: vi.fn(),
      },
      tenants: {
        findFirst: vi.fn(),
      },
    },
    transaction: vi.fn(),
  },
}));

describe("Role-Based Access Control (RBAC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves membership and allows owner role", async () => {
    const { auth, getActiveTenantMembership, requireRole } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: "user-1", name: "Alice", email: "alice@example.com" },
      session: { id: "sess-1", activeOrganizationId: "tenant-1" },
    } as any);

    (db.query.member.findFirst as any).mockResolvedValue({
      userId: "user-1",
      organizationId: "tenant-1",
      role: "owner",
    });

    const membership = await getActiveTenantMembership();
    expect(membership.tenantId).toBe("tenant-1");
    expect(membership.role).toBe("owner");
    expect(membership.userId).toBe("user-1");

    const tenantId = await requireRole(["owner", "admin"]);
    expect(tenantId).toBe("tenant-1");
  });

  it("rejects non-permitted roles with Forbidden error", async () => {
    const { auth, requireRole } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: "user-2", name: "Bob", email: "bob@example.com" },
      session: { id: "sess-2", activeOrganizationId: "tenant-2" },
    } as any);

    (db.query.member.findFirst as any).mockResolvedValue({
      userId: "user-2",
      organizationId: "tenant-2",
      role: "viewer",
    });

    await expect(requireRole(["owner", "admin"])).rejects.toThrow(
      "Forbidden: Action requires role owner or admin",
    );
  });

  it("throws Unauthorized if no session exists", async () => {
    const { auth, requireRole } = await import("@/lib/auth");

    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    await expect(requireRole(["owner", "admin"])).rejects.toThrow("Unauthorized");
  });
});
