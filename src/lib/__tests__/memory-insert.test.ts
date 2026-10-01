import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasOpenAIKey: vi.fn(),
  generateEmbedding: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/embeddings")>();
  return {
    ...actual,
    hasOpenAIKey: mocks.hasOpenAIKey,
    generateEmbedding: mocks.generateEmbedding,
  };
});

vi.mock("@/lib/db", () => ({ db: { insert: mocks.insert } }));

import { insertMemory } from "@/lib/memories";

describe("insertMemory embedding failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasOpenAIKey.mockResolvedValue(true);
  });

  it("propagates provider failures instead of reporting a successful skip", async () => {
    const providerError = new Error("embedding provider unavailable");
    mocks.generateEmbedding.mockRejectedValueOnce(providerError);

    await expect(insertMemory("tenant-1", "A saved insight", "strategy_insight"))
      .rejects.toBe(providerError);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns null only when no embedding provider is configured", async () => {
    mocks.hasOpenAIKey.mockResolvedValue(false);

    await expect(insertMemory("tenant-1", "A saved insight", "strategy_insight"))
      .resolves.toBeNull();
    expect(mocks.generateEmbedding).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
