import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findAccounts: vi.fn(),
  membership: vi.fn(),
  transaction: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const original = await importOriginal<typeof import("drizzle-orm")>();
  return { ...original, inArray: mocks.inArray.mockImplementation(original.inArray) };
});

vi.mock("@/lib/db", () => ({
  db: { query: { drafts: { findFirst: mocks.findFirst }, socialAccounts: { findMany: mocks.findAccounts } }, transaction: mocks.transaction },
}));
vi.mock("@/lib/auth", () => ({
  getActiveTenantId: vi.fn().mockResolvedValue("tenant-1"),
  getActiveTenantMembership: mocks.membership,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/publisher", () => ({ publishDraft: vi.fn() }));

import { createManualPost, getDraftForCompose } from "@/app/actions/compose";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ tenantId: "tenant-1", role: "member" });
  mocks.findAccounts.mockResolvedValue([]);
  mocks.returning.mockResolvedValue([{ id: "draft-1" }]);
  mocks.insert.mockReturnValue({ values: mocks.values.mockReturnValue({ returning: mocks.returning }) });
  mocks.update.mockReturnValue({ set: mocks.set.mockReturnValue({ where: mocks.where.mockReturnValue({ returning: mocks.returning }) }) });
  mocks.transaction.mockImplementation((callback) => callback({
    query: { drafts: { findFirst: mocks.findFirst } }, insert: mocks.insert, update: mocks.update,
  }));
});

describe("getDraftForCompose", () => {
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

describe("Compose merge safety", () => {
  const input = { content: "Saved without an account", mediaUrls: [], accountIds: [], scheduleType: "draft" as const };

  it("keeps account-independent draft creation for members", async () => {
    await expect(createManualPost(input)).resolves.toMatchObject({ success: true, draftIds: ["draft-1"] });
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1", status: "draft", platformOptions: { mediaUrls: [], source: "compose" },
    }));
  });

  it("keeps member edits limited to draft/review/rejected states", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "draft-1", platformOptions: null });
    await createManualPost({ ...input, draftId: "draft-1" });
    expect(mocks.inArray).toHaveBeenCalledWith(expect.anything(), ["draft", "pending_review", "rejected"]);
  });

  it("retains the render metadata merge when editing Chat videos", async () => {
    mocks.membership.mockResolvedValueOnce({ tenantId: "tenant-1", role: "admin" });
    mocks.findFirst.mockResolvedValueOnce({ id: "draft-1", platformOptions: { source: "chat_video", renderJobId: "job-1", renderStatus: "pending" } });
    await createManualPost({ ...input, draftId: "draft-1" });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ platformOptions: expect.objectContaining({ queryChunks: expect.any(Array) }) }));
    expect(mocks.inArray).toHaveBeenCalledWith(expect.anything(), ["draft", "pending_review", "approved", "rejected", "scheduled"]);
  });
});
