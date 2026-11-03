import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), model: vi.fn(), reserve: vi.fn(), generate: vi.fn(), settle: vi.fn(), fail: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/agent-model-resolver", () => ({ resolveModelForTurn: mocks.model }));
vi.mock("@/lib/usage", () => ({ reserveUsageBudget: mocks.reserve, settleUsageReservation: mocks.settle, failUsageReservation: mocks.fail }));
vi.mock("@/lib/ai-pricing", () => ({ estimateTextCallCost: () => 0.01, getTextModelCost: () => 0.001 }));
vi.mock("ai", () => ({ generateText: mocks.generate }));
import { generateVisualHookSuggestions } from "../media-studio";

describe("visual hook AI admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role.mockResolvedValue("tenant-1");
    mocks.model.mockResolvedValue({ model: {}, providerModelId: "model", trialGenerationLimit: 3 });
  });
  it("does not call the provider when admission fails", async () => {
    mocks.reserve.mockRejectedValue(new Error("trial limit"));
    await expect(generateVisualHookSuggestions("A post")).rejects.toThrow("workspace usage limits");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", trialGenerationLimit: 3 }));
  });
  it("settles provider usage after a successful call", async () => {
    mocks.reserve.mockResolvedValue({ id: "reservation" });
    mocks.generate.mockResolvedValue({ text: '{"suggestions":[{"text":"HELLO","preset":"clean","sticker":"none","explanation":"Clear"}]}', usage: { inputTokens: 20, outputTokens: 10 } });
    await expect(generateVisualHookSuggestions("A post")).resolves.toMatchObject({ suggestions: [{ text: "HELLO" }] });
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ id: "reservation", inputTokens: 20, outputTokens: 10 }));
  });
  it("denies users without a writer role before calling the provider", async () => {
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    await expect(generateVisualHookSuggestions("A post")).rejects.toThrow("Forbidden");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
