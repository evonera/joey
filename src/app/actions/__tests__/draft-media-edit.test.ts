import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ findDraft: vi.fn(), findPackage: vi.fn(), set: vi.fn(), where: vi.fn(), returning: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveTenantMembership: vi.fn().mockResolvedValue({ tenantId: "tenant-1", role: "owner" }) }));
vi.mock("@/lib/db", () => ({ db: {
  query: { drafts: { findFirst: mocks.findDraft }, contentPackages: { findFirst: mocks.findPackage } },
  update: () => ({ set: mocks.set }),
} }));
vi.mock("@/app/actions/theme-packages", () => ({ reviewThemePackage: vi.fn() }));
vi.mock("@/lib/draft-review", () => ({ reviewDraft: vi.fn() }));

import { updateDraft } from "../drafts";

describe("editing media draft captions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPackage.mockResolvedValue(undefined);
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: "draft-1" }]);
  });

  it("clears a caption only while the validated media is unchanged", async () => {
    const platformOptions = { mediaUrls: ["https://example.com/photo.png"] };
    mocks.findDraft.mockResolvedValue({ id: "draft-1", platformOptions });
    await expect(updateDraft("draft-1", "  ")).resolves.toEqual({ success: true });
    expect(mocks.set).toHaveBeenCalledWith({ content: "" });
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.sql).toContain("platform_options");
    expect(query.params).toContain(JSON.stringify(platformOptions));
  });

  it.each([undefined, [], ["file:///etc/passwd"]])("rejects an empty caption with invalid media %#", async (mediaUrls) => {
    mocks.findDraft.mockResolvedValue({ id: "draft-1", platformOptions: { mediaUrls } });
    await expect(updateDraft("draft-1", "")).resolves.toEqual({ error: "Add post content or valid media." });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("does not report success if the guarded update no longer matches", async () => {
    mocks.findDraft.mockResolvedValue({ id: "draft-1", platformOptions: { mediaUrls: ["https://example.com/photo.png"] } });
    mocks.returning.mockResolvedValue([]);
    expect((await updateDraft("draft-1", "")).error).toContain("Refresh");
  });

  it("continues to reject empty theme package edits", async () => {
    mocks.findDraft.mockResolvedValue(undefined);
    mocks.findPackage.mockResolvedValue({ id: "package-1" });
    await expect(updateDraft("package-1", "")).resolves.toEqual({ error: "Content cannot be empty" });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
