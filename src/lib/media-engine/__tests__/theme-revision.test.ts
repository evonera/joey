import { describe, expect, it } from "vitest";
import { themePackageRenderRevision } from "../theme-revision";

describe("themePackageRenderRevision", () => {
  const base = {
    title: "Production render validation",
    brand: { accent: "#ffe633", watermark: "@Joey" },
    name: "cric_buzz",
    format: "video",
  };

  it("is stable when render settings are re-ordered by PostgreSQL jsonb", () => {
    const fromForm = {
      mediaAssetId: "asset",
      templateFamily: "branded_clip",
      captions: false,
      cropX: 0.5,
      cropY: 0.5,
      cropMode: "contain",
      durationSeconds: 3,
      trimStart: 0,
      zoom: 1,
    };
    const fromJsonb = {
      captions: false,
      cropMode: "contain",
      cropX: 0.5,
      cropY: 0.5,
      durationSeconds: 3,
      mediaAssetId: "asset",
      templateFamily: "branded_clip",
      trimStart: 0,
      zoom: 1,
    };

    expect(themePackageRenderRevision({ ...base, component: fromForm }))
      .toBe(themePackageRenderRevision({ ...base, component: fromJsonb }));
  });

  it("changes when a pixel-affecting setting changes", () => {
    const component = { mediaAssetId: "asset", templateFamily: "branded_clip", durationSeconds: 3 };
    expect(themePackageRenderRevision({ ...base, component }))
      .not.toBe(themePackageRenderRevision({ ...base, component: { ...component, durationSeconds: 4 } }));
  });
});
