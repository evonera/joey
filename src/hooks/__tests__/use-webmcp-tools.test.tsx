import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWebMcpTools } from "@/hooks/use-webmcp-tools";

const tool: WebMCP.ModelContextTool = {
  name: "joey_test_tool",
  description: "Test tool",
  execute: () => ({ ok: true }),
};

function Harness({ tools }: { tools: WebMCP.ModelContextTool[] }) {
  const available = useWebMcpTools(tools);
  return <span>{available ? "available" : "unavailable"}</span>;
}

afterEach(() => {
  Reflect.deleteProperty(document, "modelContext");
});

describe("useWebMcpTools", () => {
  it("progressively does nothing when WebMCP is unavailable", () => {
    expect(() => render(<Harness tools={[tool]} />)).not.toThrow();
  });

  it("registers page tools and aborts their shared lifecycle on cleanup", async () => {
    const signals: AbortSignal[] = [];
    const registerTool = vi.fn(async (_tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
      if (options?.signal) signals.push(options.signal);
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });

    const view = render(<Harness tools={[tool]} />);
    await waitFor(() => expect(view.getByText("available")).toBeInTheDocument());
    expect(registerTool).toHaveBeenCalledWith(tool, { signal: expect.any(AbortSignal) });
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
    view.unmount();
    expect(signals[0].aborted).toBe(true);
  });
});
