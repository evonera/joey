import { describe, expect, it, vi } from "vitest";

import { builderStateToGraphDoc } from "@/lib/flows/builder-state";
import {
  addFlowGraphNode,
  configureFlowGraphNode,
  connectFlowGraphNodes,
  createFlowWebMcpTools,
  type FlowWebMcpState,
} from "@/lib/flows/webmcp";
import type { FlowGraphDoc } from "@/lib/flows/types";

const emptyGraph = (): FlowGraphDoc => ({ nodes: [], edges: [] });

describe("WebMCP flow graph operations", () => {
  it("places added nodes deterministically and validates supplied config", () => {
    const first = addFlowGraphNode(emptyGraph(), {
      type: "trigger.schedule",
      config: { intervalMinutes: 30 },
    }, "schedule");
    expect(first.node).toMatchObject({
      id: "schedule",
      type: "trigger.schedule",
      config: { intervalMinutes: 30 },
      position: { x: 80, y: 100 },
    });

    const second = addFlowGraphNode(first.graph, {
      type: "ai.llm",
      config: { provider: "openai", model: "gpt-4o-mini", systemPrompt: "Summarize" },
      afterNodeId: "schedule",
    }, "writer");
    expect(second.node.position).toEqual({ x: 320, y: 100 });
    expect(() => addFlowGraphNode(second.graph, {
      type: "ai.llm",
      config: { provider: "openai" },
    }, "invalid")).toThrow("Invalid config for ai.llm");
  });

  it("replaces config only after schema validation and applies defaults", () => {
    const graph = addFlowGraphNode(emptyGraph(), { type: "trigger.schedule" }, "schedule").graph;
    const configured = configureFlowGraphNode(graph, { nodeId: "schedule", config: {} });
    expect(configured.nodes[0].config).toEqual({ intervalMinutes: 1440 });
    expect(() => configureFlowGraphNode(graph, {
      nodeId: "schedule",
      config: { intervalMinutes: 1 },
    })).toThrow("Invalid config for trigger.schedule");
  });

  it("requires valid branches, rejects cycles, and preserves split handles", () => {
    const split = addFlowGraphNode(emptyGraph(), { type: "logic.split", config: {} }, "split").graph;
    const withA = addFlowGraphNode(split, { type: "action.notify" }, "notify-a").graph;
    const withBoth = addFlowGraphNode(withA, { type: "action.notify" }, "notify-b").graph;

    expect(() => connectFlowGraphNodes(withBoth, {
      fromNodeId: "split",
      toNodeId: "notify-a",
    })).toThrow("requires a branch");
    expect(() => connectFlowGraphNodes(withBoth, {
      fromNodeId: "split",
      toNodeId: "notify-a",
      branch: "unknown",
    })).toThrow("is not an output");

    const connectedA = connectFlowGraphNodes(withBoth, {
      fromNodeId: "split",
      toNodeId: "notify-a",
      branch: "a",
    });
    const connectedBoth = connectFlowGraphNodes(connectedA, {
      fromNodeId: "split",
      toNodeId: "notify-b",
      branch: "b",
    });
    expect(connectedBoth.edges).toEqual([
      { from: "split", to: "notify-a", branch: "a" },
      { from: "split", to: "notify-b", branch: "b" },
    ]);
    expect(() => connectFlowGraphNodes(connectedBoth, {
      fromNodeId: "notify-a",
      toNodeId: "split",
    })).toThrow("create a cycle");
  });

  it("serializes every named React Flow handle, including A/B branches", () => {
    const graph = builderStateToGraphDoc([
      { id: "split", position: { x: 0, y: 0 }, data: { nodeType: "logic.split", config: {} } },
      { id: "target", position: { x: 200, y: 0 }, data: { nodeType: "action.notify", config: {} } },
    ], [{ source: "split", target: "target", sourceHandle: "a" }]);
    expect(graph.edges).toEqual([{ from: "split", to: "target", branch: "a" }]);
  });
});

describe("WebMCP flow tools", () => {
  function harness() {
    let state: FlowWebMcpState = { id: "flow-1", name: "Draft flow", status: "draft", graph: emptyGraph() };
    let nextId = 1;
    const validate = vi.fn(async () => ({ ok: true, issues: [] }));
    const tools = createFlowWebMcpTools({
      getState: () => state,
      stageGraph: (graph) => { state = { ...state, graph }; },
      stageName: (name) => { state = { ...state, name }; },
      nextNodeId: () => `agent-${nextId++}`,
      validate,
    });
    return { tools, getState: () => state, validate };
  }

  async function call(tools: WebMCP.ModelContextTool[], name: string, input: Record<string, unknown>) {
    const selected = tools.find((tool) => tool.name === name);
    if (!selected) throw new Error(`Missing tool ${name}`);
    const output = await selected.execute(input, { signal: new AbortController().signal }) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    return { ...output, data: JSON.parse(output.content[0].text) as Record<string, unknown> };
  }

  it("exposes only staged editing and read-only validation tools", () => {
    const { tools } = harness();
    expect(tools.map((tool) => tool.name)).toEqual([
      "joey_list_flow_nodes",
      "joey_inspect_staged_flow",
      "joey_add_flow_node",
      "joey_configure_flow_node",
      "joey_connect_flow_nodes",
      "joey_rename_staged_flow",
      "joey_validate_staged_flow",
    ]);
    expect(tools.some((tool) => /save|activate|publish|send/.test(tool.name))).toBe(false);
    expect(tools.find((tool) => tool.name === "joey_inspect_staged_flow")?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
  });

  it("supports current preview runtimes that omit execute callback options", async () => {
    const { tools, getState } = harness();
    const selected = tools.find((candidate) => candidate.name === "joey_rename_staged_flow")!;
    const output = await selected.execute({ name: "Preview-compatible flow" }, {} as never) as {
      content: Array<{ text: string }>;
    };
    expect(JSON.parse(output.content[0].text)).toMatchObject({ ok: true, stagedOnly: true });
    expect(getState().name).toBe("Preview-compatible flow");
  });

  it("stages a complete graph while reporting errors as tool results", async () => {
    const { tools, getState } = harness();
    const trigger = await call(tools, "joey_add_flow_node", {
      type: "trigger.manual",
      config: {},
    });
    expect(trigger.data).toMatchObject({ ok: true, stagedOnly: true });
    const action = await call(tools, "joey_add_flow_node", {
      type: "action.create_draft",
      config: { platform: "linkedin" },
      afterNodeId: "agent-1",
    });
    expect(action.data).toMatchObject({ ok: true, stagedOnly: true });
    await call(tools, "joey_connect_flow_nodes", {
      fromNodeId: "agent-1",
      toNodeId: "agent-2",
    });
    expect(getState().graph.edges).toEqual([{ from: "agent-1", to: "agent-2" }]);

    const invalid = await call(tools, "joey_configure_flow_node", {
      nodeId: "agent-2",
      config: { platform: "tiktok" },
    });
    expect(invalid.isError).toBe(true);
    expect(invalid.data.error).toContain("Invalid config");
  });

  it("reads current state at execution time and validates without mutation", async () => {
    const { tools, getState, validate } = harness();
    await call(tools, "joey_rename_staged_flow", { name: "Daily theme page" });
    const inspected = await call(tools, "joey_inspect_staged_flow", {});
    expect(inspected.data).toMatchObject({ name: "Daily theme page", stagedOnly: true });
    await call(tools, "joey_validate_staged_flow", {});
    expect(validate).toHaveBeenCalledWith(getState().graph, expect.any(AbortSignal));
  });

  it("redacts sensitive configs and bounds user-authored strings during inspection", async () => {
    const { tools } = harness();
    await call(tools, "joey_add_flow_node", {
      type: "data.http",
      config: {
        method: "GET",
        url: "https://example.com",
        headersJson: '{"Authorization":"Bearer private"}',
        timeoutMs: 30_000,
        maxResponseBytes: 1024,
      },
    });
    const inspected = await call(tools, "joey_inspect_staged_flow", {});
    const nodes = inspected.data.nodes as Array<{ config: Record<string, unknown> }>;
    expect(nodes[0].config.headersJson).toBe("[redacted]");
    expect(inspected.content[0].text).not.toContain("Bearer private");
  });

  it("does not mistake ordinary token-count settings for credentials", async () => {
    const { tools } = harness();
    await call(tools, "joey_add_flow_node", {
      type: "ai.llm",
      config: {
        provider: "openai",
        model: "gpt-4o-mini",
        systemPrompt: "Summarize",
        maxTokens: 800,
      },
    });
    const inspected = await call(tools, "joey_inspect_staged_flow", {});
    const nodes = inspected.data.nodes as Array<{ config: Record<string, unknown> }>;
    expect(nodes[0].config.maxTokens).toBe(800);
  });
});
