import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    query: { drafts: { findFirst: mocks.findFirst } },
    update: mocks.update,
  },
}));

import { reviewDraft } from "@/lib/draft-review";

describe("reviewDraft missing-row handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not found when rejecting an unknown or foreign-tenant draft", async () => {
    mocks.findFirst.mockResolvedValueOnce(undefined);

    await expect(reviewDraft({ tenantId: "tenant-1", draftId: "missing", decision: "reject" }))
      .resolves.toEqual({ error: "Draft not found" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns not found if the draft is deleted between lookup and conditional update", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "draft-1" }).mockResolvedValueOnce(undefined);
    mocks.update.mockReturnValue({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    });

    await expect(reviewDraft({ tenantId: "tenant-1", draftId: "draft-1", decision: "reject" }))
      .resolves.toEqual({ error: "Draft not found" });
  });

  it("rejects a variant name without its matching approved content", async () => {
    await expect(reviewDraft({
      tenantId: "tenant-1",
      draftId: "draft-1",
      decision: "approve",
      variantName: "Short hook",
    })).resolves.toEqual({ error: "Variant name and content must be provided together." });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("rejects empty content for a selected variant", async () => {
    await expect(reviewDraft({
      tenantId: "tenant-1",
      draftId: "draft-1",
      decision: "approve",
      variantName: "Short hook",
      content: "  ",
    })).resolves.toEqual({ error: "Variant content cannot be empty." });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
