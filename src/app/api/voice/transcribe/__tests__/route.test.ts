import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), transcribe: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveTenant: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/voice-transcription", () => ({ MAX_VOICE_BYTES: 200, VOICE_MEDIA_TYPES: new Set(["audio/webm"]), transcribeVoice: mocks.transcribe }));
import { POST } from "../route";
const request = (body = new Uint8Array(100), headers: Record<string, string> = {}) => new Request("https://joey.example/api/voice/transcribe", { method: "POST", headers: { origin: "https://joey.example", "content-type": "audio/webm", ...headers }, body });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ tenantId: "workspace", user: { id: "user" } }); mocks.rate.mockResolvedValue({ allowed: true }); mocks.transcribe.mockResolvedValue({ text: "Original words" }); });
describe("voice HTTP boundary", () => {
  it("rejects cross-origin cookie requests before authentication or provider calls", async () => {
    expect((await POST(request(undefined, { origin: "https://foreign.example" }))).status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.transcribe).not.toHaveBeenCalled();
  });
  it("rejects an anonymous recording", async () => { mocks.auth.mockRejectedValue(new Error("Unauthorized")); expect((await POST(request())).status).toBe(401); expect(mocks.transcribe).not.toHaveBeenCalled(); });
  it("uses the session workspace and rate limits repeated recordings", async () => {
    expect(await (await POST(request())).json()).toEqual({ text: "Original words" });
    expect(mocks.transcribe).toHaveBeenCalledWith("workspace", expect.any(Uint8Array), "audio/webm", expect.any(AbortSignal));
    mocks.rate.mockResolvedValue({ allowed: false }); expect((await POST(request())).status).toBe(429);
    expect(mocks.transcribe).toHaveBeenCalledOnce();
  });
  it("bounds streamed audio even with no content-length header", async () => { expect((await POST(request(new Uint8Array(201)))).status).toBe(413); expect(mocks.transcribe).not.toHaveBeenCalled(); });
  it("rejects content masquerading as a text upload", async () => { expect((await POST(request(undefined, { "content-type": "text/plain" }))).status).toBe(415); expect(mocks.transcribe).not.toHaveBeenCalled(); });
});
