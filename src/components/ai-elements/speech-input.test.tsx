import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechInput } from "./speech-input";
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
let active: FakeRecorder;
class FakeRecorder {
  static isTypeSupported(type: string) { return type.startsWith("audio/webm"); }
  state = "inactive"; mimeType = "audio/webm";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => Promise<void>; onerror?: () => void;
  constructor() { active = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; const bytes = new Uint8Array(200); bytes.set([0x1a,0x45,0xdf,0xa3]); this.ondataavailable?.({ data: new Blob([bytes]) }); void this.onstop?.(); }
}
const track = { stop: vi.fn(), onended: null };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] }) } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "Joey voice verification" }) }));
});
afterEach(() => vi.unstubAllGlobals());
describe("record and transcribe voice", () => {
  it("keeps recording until Stop and returns the transcript without submitting chat", async () => {
    const done = vi.fn(); render(<SpeechInput onTranscription={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
    await screen.findByRole("button", { name: "Stop listening" });
    expect(screen.getByRole("status")).toHaveTextContent("Recording");
    expect(fetch).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith("Joey voice verification"));
    expect(fetch).toHaveBeenCalledWith("/api/voice/transcribe", expect.objectContaining({ method: "POST", body: expect.any(Blob) }));
    expect(track.stop).toHaveBeenCalled();
  });
  it("releases microphone tracks and never uploads after navigating away", async () => {
    const done = vi.fn(); const view = render(<SpeechInput onTranscription={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
    await screen.findByRole("button", { name: "Stop listening" });
    view.unmount();
    expect(active.state).toBe("inactive"); expect(track.stop).toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("explains denied permission instead of silently turning off", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    render(<SpeechInput />); fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Allow microphone")));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reports server rejection and restores the button", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "No clear speech detected." }) } as Response);
    render(<SpeechInput />); fireEvent.click(screen.getByRole("button", { name: "Voice input" })); await screen.findByRole("button", { name: "Stop listening" });
    await act(async () => { active.stop(); });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No clear speech detected."));
    expect(screen.getByRole("button", { name: "Voice input" })).toBeEnabled();
  });
});
