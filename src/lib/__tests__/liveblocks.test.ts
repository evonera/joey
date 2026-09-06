import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAllow = vi.fn();
const mockAuthorize = vi.fn().mockResolvedValue({
  status: 200,
  body: JSON.stringify({ token: "lb_test_jwt" }),
});
const mockPrepareSession = vi.fn().mockReturnValue({
  allow: mockAllow,
  authorize: mockAuthorize,
  FULL_ACCESS: ["*:write"],
  READ_ACCESS: ["*:read"],
});

let mockIsConfigured = true;
let mockLiveblocksInstance: any = {
  prepareSession: mockPrepareSession,
};

vi.mock("@/lib/liveblocks", () => ({
  get liveblocks() {
    return mockLiveblocksInstance;
  },
  isLiveblocksConfigured: vi.fn(() => mockIsConfigured),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
  getActiveTenantMembership: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      user: {
        findMany: vi.fn(),
      },
      member: {
        findMany: vi.fn(),
      },
      drafts: {
        findMany: vi.fn(),
      },
      flows: {
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

describe("Liveblocks Integration & Auth Scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured = true;
    mockLiveblocksInstance = {
      prepareSession: mockPrepareSession,
    };
  });

  describe("Configuration & Client Factory", () => {
    it("detects configuration status correctly based on environment", async () => {
      // Test real function without mocks
      const { isLiveblocksConfigured } = await vi.importActual<any>("@/lib/liveblocks");

      const originalEnv = process.env.LIVEBLOCKS_SECRET_KEY;
      
      delete process.env.LIVEBLOCKS_SECRET_KEY;
      expect(isLiveblocksConfigured()).toBe(false);

      process.env.LIVEBLOCKS_SECRET_KEY = "sk_test_12345";
      expect(isLiveblocksConfigured()).toBe(true);

      // Restore
      if (originalEnv) {
        process.env.LIVEBLOCKS_SECRET_KEY = originalEnv;
      } else {
        delete process.env.LIVEBLOCKS_SECRET_KEY;
      }
    });
  });

  describe("POST /api/liveblocks-auth", () => {
    it("returns 401 when Liveblocks client is not configured", async () => {
      mockLiveblocksInstance = null;
      mockIsConfigured = false;

      const { POST } = await import("@/app/api/liveblocks-auth/route");
      const req = new Request("http://localhost:3000/api/liveblocks-auth", {
        method: "POST",
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("not configured");
    });

    it("returns 401 when user is not authenticated", async () => {
      const { auth } = await import("@/lib/auth");
      (auth.api.getSession as any).mockResolvedValue(null);

      const { POST } = await import("@/app/api/liveblocks-auth/route");
      const req = new Request("http://localhost:3000/api/liveblocks-auth", {
        method: "POST",
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it("prepares scoped session with tenantId and returns token", async () => {
      const { auth, getActiveTenantMembership } = await import("@/lib/auth");
      (auth.api.getSession as any).mockResolvedValue({
        user: {
          id: "usr_123",
          name: "Alex",
          email: "alex@example.com",
          image: "https://avatar.png",
        },
      });
      (getActiveTenantMembership as any).mockResolvedValue({
        tenantId: "org_alpha",
        userId: "usr_123",
        role: "admin",
      });

      const { POST } = await import("@/app/api/liveblocks-auth/route");
      const req = new Request("http://localhost:3000/api/liveblocks-auth", {
        method: "POST",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      // Verify organizationId scoping
      expect(mockPrepareSession).toHaveBeenCalledWith(
        "usr_123",
        expect.objectContaining({
          organizationId: "org_alpha",
          userInfo: expect.objectContaining({
            name: "Alex",
            role: "admin",
          }),
        })
      );

      // Verify room permission pattern is strictly scoped to this workspace
      expect(mockAllow).toHaveBeenCalledWith(
        "workspace:org_alpha:*",
        expect.anything()
      );
    });
  });

  describe("POST /api/liveblocks-users", () => {
    it("returns 401 when unauthorized", async () => {
      const { auth } = await import("@/lib/auth");
      (auth.api.getSession as any).mockResolvedValue(null);

      const { POST } = await import("@/app/api/liveblocks-users/route");
      const req = new Request("http://localhost:3000/api/liveblocks-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ["usr_1"] }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("resolves user details maintaining order", async () => {
      const { auth } = await import("@/lib/auth");
      const { db } = await import("@/lib/db");
      (auth.api.getSession as any).mockResolvedValue({
        user: { id: "usr_1" },
      });

      (db.query.user.findMany as any).mockResolvedValue([
        { id: "usr_2", name: "Bob", image: "https://bob.png" },
        { id: "usr_1", name: "Alice", image: "https://alice.png" },
      ]);

      const { POST } = await import("@/app/api/liveblocks-users/route");
      const req = new Request("http://localhost:3000/api/liveblocks-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ["usr_1", "usr_2", "usr_unknown"] }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveLength(3);
      expect(data[0]).toEqual({ name: "Alice", avatar: "https://alice.png" });
      expect(data[1]).toEqual({ name: "Bob", avatar: "https://bob.png" });
      expect(data[2]).toEqual({ name: "Teammate" });
    });
  });

  describe("GET /api/liveblocks-users (Mentions)", () => {
    it("returns active workspace member user IDs matching search filter", async () => {
      const { getActiveTenantMembership } = await import("@/lib/auth");
      const { db } = await import("@/lib/db");

      (getActiveTenantMembership as any).mockResolvedValue({
        tenantId: "org_alpha",
        userId: "usr_1",
        role: "admin",
      });

      (db.query.member.findMany as any).mockResolvedValue([
        { userId: "usr_1" },
        { userId: "usr_2" },
      ]);

      (db.query.user.findMany as any).mockResolvedValue([
        { id: "usr_1", name: "Alice Cooper", email: "alice@cooper.com" },
        { id: "usr_2", name: "Bob Martin", email: "bob@martin.com" },
      ]);

      const { GET } = await import("@/app/api/liveblocks-users/route");

      // Search matching "bob"
      const req = new Request("http://localhost:3000/api/liveblocks-users?text=bob");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.userIds).toEqual(["usr_2"]);
    });
  });

  describe("POST /api/liveblocks-rooms (Room Metadata Resolution)", () => {
    it("resolves draft, flow, and presence room IDs to human-readable names and URLs", async () => {
      const { auth, getActiveTenantMembership } = await import("@/lib/auth");
      const { db } = await import("@/lib/db");

      (auth.api.getSession as any).mockResolvedValue({
        user: { id: "usr_1", name: "Alice" },
      });

      (getActiveTenantMembership as any).mockResolvedValue({
        tenantId: "org_alpha",
        userId: "usr_1",
        role: "admin",
      });

      (db.query.drafts.findMany as any).mockResolvedValue([
        {
          id: "draft_123",
          tenantId: "org_alpha",
          content: "Excited to launch our new automated growth tool for creators!",
        },
      ]);

      (db.query.flows.findMany as any).mockResolvedValue([
        {
          id: "flow_456",
          tenantId: "org_alpha",
          name: "Daily RSS to LinkedIn Pipeline",
        },
      ]);

      const { POST } = await import("@/app/api/liveblocks-rooms/route");
      const req = new Request("http://localhost:3000/api/liveblocks-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomIds: [
            "workspace:org_alpha:presence",
            "workspace:org_alpha:draft:draft_123",
            "workspace:org_alpha:flow:flow_456",
            "workspace:org_alpha:draft:draft_missing",
          ],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveLength(4);
      expect(data[0]).toEqual({
        name: "Workspace Team Presence",
        url: "/dashboard",
      });
      expect(data[1]).toEqual({
        name: "Excited to launch our new automated grow…",
        url: "/drafts",
      });
      expect(data[2]).toEqual({
        name: "Daily RSS to LinkedIn Pipeline",
        url: "/flows/flow_456",
      });
      expect(data[3]).toEqual({
        name: "Draft #draft_mi",
        url: "/drafts",
      });
    });
  });
});
