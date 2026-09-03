import { describe, expect, it } from "vitest";
import { MEMORY_MAX_CHARS, prepareMemoryContent } from "../memories";
import { assertEmbeddingDimensions, EMBEDDING_DIMENSIONS } from "../embeddings";

describe("memory content preparation", () => {
  it("rejects empty content", () => {
    expect(() => prepareMemoryContent("   ")).toThrow("Cannot store empty memory.");
    expect(() => prepareMemoryContent("")).toThrow("Cannot store empty memory.");
  });

  it("redacts PII and truncates to the max", () => {
    const prepared = prepareMemoryContent(`Contact jane@example.com. ${"x".repeat(7000)}`);
    expect(prepared).not.toContain("jane@example.com");
    expect(prepared.length).toBeLessThanOrEqual(MEMORY_MAX_CHARS);
  });

  it("passes short clean content through", () => {
    expect(prepareMemoryContent("  Brand voice is playful.  ")).toBe("Brand voice is playful.");
  });
});

describe("embedding dimension guard", () => {
  it("accepts a valid vector", () => {
    expect(() =>
      assertEmbeddingDimensions(new Array(EMBEDDING_DIMENSIONS).fill(0.1)),
    ).not.toThrow();
  });

  it("rejects wrong-length, non-array, and non-finite vectors", () => {
    expect(() => assertEmbeddingDimensions([])).toThrow("1536-dimensional");
    expect(() => assertEmbeddingDimensions(new Array(1536).fill(0).concat([1]))).toThrow();
    expect(() => assertEmbeddingDimensions(undefined)).toThrow();
    const bad = new Array(EMBEDDING_DIMENSIONS).fill(0);
    bad[10] = Number.NaN;
    expect(() => assertEmbeddingDimensions(bad)).toThrow();
  });
});
