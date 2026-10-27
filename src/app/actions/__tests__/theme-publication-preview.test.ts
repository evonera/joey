import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), find: vi.fn(), reconcile: vi.fn(), publish: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/db", () => ({ db: { query: { contentPackages: { findFirst: mocks.find } } } }));
vi.mock("@/lib/theme-studio/publishing/locked-preview", () => ({ lockedThemePreview: vi.fn() }));
vi.mock("@/lib/theme-studio/publishing/publisher", () => ({ publishContentPackage: mocks.publish }));
vi.mock("@/lib/theme-studio/publishing/reconcile-post-event", () => ({ reconcileThemePackagePostEvent: mocks.reconcile }));
import { publishConfirmedThemePackage, reconcileThemePublication } from "../theme-publication-preview";

describe("theme publication authorization and recovery", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.role.mockResolvedValue("tenant-1"); });
  it("rejects invalid confirmations without publishing", async () => {
    expect((await publishConfirmedThemePackage("pkg", false, "invalid")).success).toBe(false);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("rejects unauthorized recovery without querying or publishing", async () => {
    mocks.role.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await reconcileThemePublication("pkg")).error).toBeTruthy();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("checks only an existing provider receipt", async () => {
    mocks.find.mockResolvedValueOnce({ metrics: {} }).mockResolvedValueOnce({ metrics: { zernioPostId: "remote" } });
    expect((await reconcileThemePublication("pkg")).error).toMatch(/No provider receipt/);
    expect(await reconcileThemePublication("pkg")).toEqual({ success: true });
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({ post: expect.objectContaining({ id: "remote" }) }), "tenant-1");
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
