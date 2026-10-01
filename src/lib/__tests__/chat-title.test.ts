import { describe, expect, it } from "vitest";
import { userPromptText } from "../chat-title";
describe("Conversation title display metadata", () => {
  it("keeps the request after source and destination preambles", () => {
    expect(userPromptText("[Active Sources: web, workspace]\n[Target Channels: instagram (accounts: private-id)]\n\nDraft an original story")).toBe("Draft an original story");
  });
  it("keeps ordinary bracketed user prose and normalizes whitespace", () => {
    expect(userPromptText("[My idea]  A careful\n launch")).toBe("[My idea] A careful launch");
  });
  it("supports either preamble alone without inventing a title", () => {
    expect(userPromptText("[Target Channels: instagram]\n\nHello")).toBe("Hello");
    expect(userPromptText("[Active Sources: web]\n")).toBe("");
  });
});
