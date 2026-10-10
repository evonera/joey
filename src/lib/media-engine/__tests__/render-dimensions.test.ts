import { expect, it } from "vitest";
import { renderDimensions } from "../spec";
it("uses the same output dimensions for layout and saved asset metadata", () => {
  expect(renderDimensions({ format: "png", aspectRatio: "1:1" })).toEqual({ width: 1080, height: 1080 });
  expect(renderDimensions({ format: "png", aspectRatio: "16:9" })).toEqual({ width: 1080, height: 608 });
  expect(renderDimensions({ format: "png" })).toEqual({ width: 1080, height: 1350 });
  expect(renderDimensions({ format: "mp4" })).toEqual({ width: 1080, height: 1920 });
});
