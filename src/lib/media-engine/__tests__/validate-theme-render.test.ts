import { describe, expect, it, vi } from "vitest";
vi.mock("../theme-adapter", () => ({ deriveThemeRenderInput: () => ({ revision: "current" }) }));
vi.mock("../legacy-theme-input", () => ({ deriveLegacyThemeRenderInput: () => ({ revision: "legacy" }) }));
import { validateThemeRenderSnapshot } from "../validate-theme-render";

const base = { pkg: { metrics: { renderJobId: "job", renderRevision: "current" }, renderedAssetUrls: [{ assetId: "asset" }] }, page: {}, format: { mediaType: "image" }, job: { id: "job", status: "succeeded", outputAssetId: "asset" }, output: { id: "asset" } } as any;
describe("theme render readiness", () => {
  it("accepts a completed render attached to the package", () => expect(() => validateThemeRenderSnapshot(base)).not.toThrow());
  it.each([
    { job: undefined },
    { job: { ...base.job, status: "failed" } },
    { output: undefined },
    { pkg: { ...base.pkg, metrics: { renderJobId: "job", renderRevision: "old" } } },
    { pkg: { ...base.pkg, renderedAssetUrls: [] } },
  ])("rejects incomplete or stale output %#", (change) => expect(() => validateThemeRenderSnapshot({ ...base, ...change })).toThrow());
  it("checks legacy revisions and rejects unrendered video", () => {
    expect(() => validateThemeRenderSnapshot({ ...base, pkg: { metrics: { legacyRenderRevision: "legacy" }, renderedAssetUrls: [] } })).not.toThrow();
    expect(() => validateThemeRenderSnapshot({ ...base, pkg: { metrics: { legacyRenderRevision: "old" }, renderedAssetUrls: [] } })).toThrow();
    expect(() => validateThemeRenderSnapshot({ ...base, pkg: { metrics: {}, renderedAssetUrls: [] }, format: { mediaType: "video" } })).toThrow();
  });
});
