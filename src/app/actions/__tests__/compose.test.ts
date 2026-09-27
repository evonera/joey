import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { query: { drafts: { findFirst: mocks.findFirst } } },
}));
vi.mock("@/lib/auth", () => ({
  getActiveTenantId: vi.fn().mockResolvedValue("tenant-1"),
  getActiveTenantMembership: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/publisher", () => ({ publishDraft: vi.fn() }));

import { getDraftForCompose } from "@/app/actions/compose";

describe("getDraftForCompose", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads legacy draft-status records that the save action permits editing", async () => {
    const draft = { id: "draft-1", tenantId: "tenant-1", status: "draft", content: "A saved post" };
    mocks.findFirst.mockResolvedValueOnce(draft);

    await expect(getDraftForCompose("draft-1")).resolves.toEqual({ draft });
  });

  it("continues to reject drafts that are publishing or already published", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "draft-2", status: "publishing" });

    await expect(getDraftForCompose("draft-2")).resolves.toEqual({
      error: "This draft cannot be edited while publishing or after publication.",
    });
  });
});
