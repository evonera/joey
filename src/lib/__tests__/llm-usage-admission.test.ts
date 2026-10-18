import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ key: vi.fn(), paid: vi.fn(), reserve: vi.fn(), settle: vi.fn(), fail: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { apiKeys: { findFirst: mocks.key } } } }));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "byok-test-key" }));
vi.mock("@/lib/billing", () => ({ isProTenant: mocks.paid }));
vi.mock("@/lib/usage", () => ({ reserveUsageBudget: mocks.reserve, settleUsageReservation: mocks.settle, failUsageReservation: mocks.fail }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: mocks.generate } }; } }));
import { runLlm } from "../llm";
const request = { tenantId: "workspace", provider: "google" as const, model: "gemini-3.8-flash", messages: [{ role: "user" as const, content: "Draft a caption" }] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "platform-test-key");
  mocks.key.mockResolvedValue(null); mocks.paid.mockResolvedValue(false);
  mocks.reserve.mockResolvedValue({ id: "reservation" });
  mocks.generate.mockResolvedValue({ usage: { prompt_tokens: 20, completion_tokens: 8 }, choices: [{ finish_reason: "stop", message: { content: "A caption" } }] });
});
describe("runLlm atomic trial admission", () => {
  it("carries platform-free trial admission into the budget transaction", async () => {
    await runLlm(request);
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "workspace", trialGenerationLimit: 3 }));
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("does not call or retry a provider when atomic admission rejects", async () => {
    mocks.reserve.mockRejectedValueOnce(new Error("rate_limit:trial"));
    await expect(runLlm(request)).rejects.toThrow("rate_limit:trial");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
  });
  it.each(["paid", "BYOK"])("keeps %s calls outside the free trial limit", async source => {
    if (source === "paid") mocks.paid.mockResolvedValue(true);
    else mocks.key.mockResolvedValue({ status: "active", encryptedKey: "encrypted-test-key" });
    await runLlm(request);
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ trialGenerationLimit: undefined }));
  });
});
