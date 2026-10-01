import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDrafts: vi.fn(),
  findPosts: vi.fn(),
  findAccounts: vi.fn(),
  findPackages: vi.fn(),
  findFormats: vi.fn(),
  getActiveTenantMembership: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      drafts: { findMany: mocks.findDrafts },
      posts: { findMany: mocks.findPosts },
      socialAccounts: { findMany: mocks.findAccounts },
      contentPackages: { findMany: mocks.findPackages },
      themeContentFormats: { findMany: mocks.findFormats },
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  getActiveTenantMembership: mocks.getActiveTenantMembership,
  requireRole: vi.fn(),
}));

import { getCalendarPosts } from "@/app/actions/calendar";

describe("calendar reschedule capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveTenantMembership.mockResolvedValue({ tenantId: "tenant-1", role: "member" });
    mocks.findDrafts.mockResolvedValue([{
      id: "draft-1",
      status: "scheduled",
      scheduledFor: new Date("2026-10-01T10:00:00.000Z"),
      content: "Scheduled post",
      platformOptions: {},
    }]);
    mocks.findPosts.mockResolvedValue([]);
    mocks.findAccounts.mockResolvedValue([]);
    mocks.findPackages.mockResolvedValue([]);
    mocks.findFormats.mockResolvedValue([]);
  });

  it("does not advertise rescheduling to ordinary workspace members", async () => {
    const result = await getCalendarPosts("2026-10-01", "2026-10-31");
    expect(result.posts?.[0].canReschedule).toBe(false);
  });

  it("advertises rescheduling to workspace owners and admins", async () => {
    mocks.getActiveTenantMembership.mockResolvedValue({ tenantId: "tenant-1", role: "admin" });
    const result = await getCalendarPosts("2026-10-01", "2026-10-31");
    expect(result.posts?.[0].canReschedule).toBe(true);
  });
});
