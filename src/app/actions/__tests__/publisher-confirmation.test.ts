import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findPackage: vi.fn(), execute: vi.fn(), getProvider: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn().mockResolvedValue("tenant-1") }));
vi.mock("@/lib/db", () => ({ db: { query: { contentPackages: { findFirst: mocks.findPackage } } } }));
vi.mock("@/lib/publisher-core", () => ({ executePublishDraft: mocks.execute, getZernioClientForTenant: mocks.getProvider }));

import { publishDraft } from "../publisher";

describe("legacy ID-only publication", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.findPackage.mockResolvedValue(undefined); });
  it("does not publish a standard draft without the reviewed snapshot", async () => {
    await expect(publishDraft("draft-1")).resolves.toEqual({ error: "Refresh and confirm the draft before publishing." });
    expect(mocks.getProvider).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
