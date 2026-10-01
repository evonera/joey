import { describe, expect, it } from "vitest";
import { userPromptText, messageWithChatContext } from "../chat-title";
describe("Conversation title display metadata", () => {
  it("keeps the request after source and destination preambles", () => {
    expect(userPromptText(messageWithChatContext("Draft an original story", "[Active Sources: web, workspace]\n[Target Channels: instagram (accounts: private-id)]"))).toBe("Draft an original story");
  });
  it("keeps ordinary bracketed user prose and normalizes whitespace", () => {
    expect(userPromptText("[My idea]  A careful\n launch")).toBe("[My idea] A careful launch");
  });
  it("supports either preamble alone without inventing a title", () => {
    expect(userPromptText(messageWithChatContext("Hello", "[Target Channels: instagram]"))).toBe("Hello");
    expect(userPromptText(messageWithChatContext("", "[Active Sources: web]"))).toBe("");
  });
  it("preserves user-authored metadata-like text without selections", () => {
    const text = "[Active Sources: my own text]\n[Target Channels: example]\nExplain this notation";
    expect(userPromptText(messageWithChatContext(text, ""))).toBe("[Active Sources: my own text] [Target Channels: example] Explain this notation");
  });
  it("handles attachment-only context after composer trimming", () => {
    const message = messageWithChatContext("", "[Target Channels: instagram (accounts: private-id)]\n");
    expect(message.endsWith("[/Joey context]")).toBe(true);
    expect(userPromptText(message)).toBe("");
  });
});
