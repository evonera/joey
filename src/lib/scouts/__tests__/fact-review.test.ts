import { beforeEach, describe, expect, it, vi } from "vitest";
import { scoutFactReviewRequired, scoutRenderableFacts } from "../fact-review";
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn().mockResolvedValue("tenant-1"), getActiveTenantId: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { contentPackages: { findFirst: mocks.find } }, update: () => ({ set: mocks.update }) } }));
vi.mock("@/lib/media-engine/theme-adapter", () => ({ assertThemeRenderCurrent: mocks.render, queueThemeRender: vi.fn() }));
vi.mock("@/lib/theme-studio/publishing/publisher", () => ({ publishContentPackage: vi.fn() }));
import { reviewThemePackage } from "@/app/actions/theme-packages";

describe("Scout fact review", () => {
  const date = new Date("2026-10-01T00:00:00Z");
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.find.mockResolvedValue({ id: "pkg", status: "pending_review", updatedAt: date, provenance: { requiresFactReview: true }, renderedAssetUrls: [{ url: "https://assets.example.com/card.png" }] });
    mocks.update.mockReturnValue({ where: () => ({ returning: async () => [{ id: "pkg", status: "approved" }] }) });
  });
  it("excludes uncertain Scout facts from carousel takeaways but preserves legacy facts", () => {
    const facts = [{ claim: "Supported", corroborationStatus: "corroborated" }, { claim: "Uncertain", corroborationStatus: "unverified" }, { claim: "No evidence" }];
    expect(scoutRenderableFacts(facts, { scoutId: "scout" })).toEqual([facts[0]]);
    expect(scoutRenderableFacts(facts, {})).toHaveLength(3);
  });
  it("flags only explicit outstanding review", () => {
    expect(scoutFactReviewRequired({ requiresFactReview: true })).toBe(true);
    expect(scoutFactReviewRequired({ requiresFactReview: false })).toBe(false);
    expect(scoutFactReviewRequired(null)).toBe(false);
  });
  it("refuses approval without review and rejects acknowledgement of an old revision", async () => {
    expect(await reviewThemePackage("pkg", "approve")).toHaveProperty("error");
    expect(await reviewThemePackage("pkg", "approve", undefined, { updatedAt: "old" })).toHaveProperty("error");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("records current-revision acknowledgement only as part of conditional approval", async () => {
    expect(await reviewThemePackage("pkg", "approve", undefined, { updatedAt: date.toISOString() })).toHaveProperty("package");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "approved", provenance: expect.objectContaining({ requiresFactReview: false, factReviewAcknowledgedAt: expect.any(String) }) }));
  });
  it("allows rejection without claiming the facts were reviewed", async () => {
    await reviewThemePackage("pkg", "reject");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("provenance");
  });
});
