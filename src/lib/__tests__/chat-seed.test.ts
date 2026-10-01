import { describe, expect, it, vi } from "vitest";
import { consumeChatSeed } from "../chat-seed";

describe("chat creation seed ownership", () => {
  it("does not read or consume a global seed inside a persona chat", () => {
    const storage = { getItem: vi.fn(() => JSON.stringify({ prompt: "Create a draft", autoSend: true })), removeItem: vi.fn() };
    expect(consumeChatSeed(storage, "scoped-agent")).toBeUndefined();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
  it("consumes an explicitly auto-send text seed once in Joey chat", () => {
    sessionStorage.setItem("joey_seed_prompt", JSON.stringify({ prompt: "Create a draft", autoSend: true }));
    expect(consumeChatSeed(sessionStorage)).toBe("Create a draft");
    expect(consumeChatSeed(sessionStorage)).toBeUndefined();
  });
  it.each([{ prompt: {}, autoSend: true }, { prompt: "Draft", autoSend: false }, { prompt: " ", autoSend: true }])("does not send invalid or non-auto seeds: %j", seed => {
    sessionStorage.setItem("joey_seed_prompt", JSON.stringify(seed));
    expect(consumeChatSeed(sessionStorage)).toBeUndefined();
  });
});
