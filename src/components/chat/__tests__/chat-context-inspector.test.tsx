import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calculateSessionTokensAndCost } from "@/lib/chat-sessions";
import { ChatContextInspector } from "../chat-context-inspector";

describe("Chat context estimate disclosure", () => {
  it("does not present transcript approximations as billed provider usage", () => {
    const messages = [{ role: "user", content: "Hello" }];
    const modelId = "gemini-3.8-flash";
    render(<ChatContextInspector sessionTitle="Acceptance" modelId={modelId}
      messages={messages} {...calculateSessionTokensAndCost(messages, modelId)} />);
    expect(screen.getByText(/Transcript estimates, not billed usage/)).toBeVisible();
    expect(screen.getByText("Estimated Transcript Cost")).toBeVisible();
    expect(screen.getByText("Estimated Transcript Tokens")).toBeVisible();
    expect(screen.getByText("Not available from transcript")).toBeVisible();
    expect(screen.queryByText("Total Cost")).not.toBeInTheDocument();
  });
});
