import { describe, expect, it } from "vitest";
import { curatedAssetRef, isCuratedAssetRef } from "../curated-assets";

describe("curated media asset references", () => {
  it("converts catalog clips to allowlisted public R2 keys", () => {
    const ref = curatedAssetRef("ishowspeed_shock_bark");
    expect(ref).toEqual({
      id: "curated:ishowspeed_shock_bark",
      version: "public-clips/streamers/ishowspeed_shock_bark.mp4",
    });
    expect(isCuratedAssetRef(ref)).toBe(true);
    expect(isCuratedAssetRef({ ...ref, version: "public-clips/other.mp4" })).toBe(false);
  });

  it("rejects unknown catalog IDs", () => {
    expect(() => curatedAssetRef("not-a-real-clip")).toThrow("no longer available");
    expect(isCuratedAssetRef({ id: "curated:example", version: "tenant/private.mp4" })).toBe(false);
  });
});
