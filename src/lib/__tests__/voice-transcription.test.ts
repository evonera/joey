import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), key: vi.fn(), paid: vi.fn(), trial: vi.fn(), reserve: vi.fn(), settle: vi.fn(), fail: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.generate }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: () => () => "google-model" }));
vi.mock("@/lib/agent-model-resolver", () => ({ resolveProviderKeyInfo: mocks.key }));
vi.mock("@/lib/billing", () => ({ isProTenant: mocks.paid }));
vi.mock("@/lib/usage", () => ({ assertTrialQuota: mocks.trial, reserveUsageBudget: mocks.reserve, settleUsageReservation: mocks.settle, failUsageReservation: mocks.fail }));
import { transcribeVoice, validateVoiceAudio, MAX_VOICE_BYTES } from "../voice-transcription";
const audio = new Uint8Array(200); audio.set([0x1a, 0x45, 0xdf, 0xa3]);
beforeEach(() => { vi.clearAllMocks(); mocks.trial.mockResolvedValue(undefined); mocks.key.mockResolvedValue({ key: "secret", isByok: false }); mocks.paid.mockResolvedValue(false); mocks.reserve.mockResolvedValue({ id: "reservation" }); mocks.generate.mockResolvedValue({ text: "Joey voice verification", finishReason: "stop", usage: { inputTokens: 100, outputTokens: 8 } }); });
describe("voice admission and transcription", () => {
  it("transcribes audio only after workspace quota and budget admission, and settles actual usage", async () => {
    expect(await transcribeVoice("workspace", audio, "audio/webm")).toEqual({ text: "Joey voice verification" });
    expect(mocks.key).toHaveBeenCalledWith("google", "workspace");
    expect(mocks.trial).toHaveBeenCalledWith("workspace", 3);
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "workspace", metadata: { provider: "google", source: "voice_transcription" } }));
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, messages: [{ role: "user", content: [expect.objectContaining({ type: "text" }), { type: "file", data: audio, mediaType: "audio/webm" }] }] }));
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ id: "reservation", inputTokens: 100, outputTokens: 8 }));
  });
  it("never calls a provider after exhausted trial quota", async () => {
    mocks.trial.mockRejectedValue(new Error("Trial exhausted"));
    await expect(transcribeVoice("workspace", audio, "audio/webm")).rejects.toThrow("Trial exhausted");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("settles a silent response but reports no clear speech", async () => {
    mocks.generate.mockResolvedValue({ text: "", finishReason: "stop", usage: {} });
    await expect(transcribeVoice("workspace", audio, "audio/webm")).rejects.toThrow("No clear speech");
    expect(mocks.settle).toHaveBeenCalledOnce(); expect(mocks.fail).not.toHaveBeenCalled();
  });
  it("does not expose provider errors or retry an ambiguous paid request", async () => {
    mocks.generate.mockRejectedValue(new Error("private upstream error"));
    await expect(transcribeVoice("workspace", audio, "audio/webm")).rejects.toThrow("could not connect");
    expect(mocks.generate).toHaveBeenCalledOnce(); expect(mocks.fail).toHaveBeenCalledOnce();
  });
  it("rejects malformed, unsupported and oversized audio before resolving credentials", async () => {
    expect(() => validateVoiceAudio(new Uint8Array(200), "audio/webm")).toThrow("Invalid voice");
    expect(() => validateVoiceAudio(audio, "text/plain")).toThrow("Unsupported");
    await expect(transcribeVoice("workspace", new Uint8Array(MAX_VOICE_BYTES + 1), "audio/webm")).rejects.toThrow("short voice");
    expect(mocks.key).not.toHaveBeenCalled();
  });
});
