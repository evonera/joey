import { describe, expect, it } from "vitest";
import { checkActivationReadiness } from "../activation-readiness";
import type { FlowGraphDoc } from "../types";

const graph: FlowGraphDoc = {
  nodes: [
    { id: "research", type: "data.exa_search", config: { query: "news" }, position: { x: 0, y: 0 } },
    { id: "write", type: "ai.llm", config: { provider: "openai" }, position: { x: 100, y: 0 } },
    { id: "draft", type: "action.create_draft", config: { platform: "linkedin" }, position: { x: 200, y: 0 } },
  ],
  edges: [],
};

describe("flow activation readiness", () => {
  it("blocks a scheduled draft flow before its research and AI keys exist", () => {
    const issues = checkActivationReadiness(graph, { keys: [], accounts: [], env: {} });
    expect(issues.map((issue) => issue.nodeId)).toEqual(["research", "write"]);
  });

  it("allows draft-only flows to run before a publishing account is connected", () => {
    const issues = checkActivationReadiness(graph, {
      keys: [{ provider: "exa", status: "active" }, { provider: "openai", status: "active" }],
      accounts: [], env: {},
    });
    expect(issues).toEqual([]);
  });

  it("does not fall back to a server key after a workspace key is revoked", () => {
    const issues = checkActivationReadiness(graph, {
      keys: [{ provider: "exa", status: "revoked" }, { provider: "openai", status: "active" }],
      accounts: [], env: { exa: true },
    });
    expect(issues.map((issue) => issue.nodeId)).toEqual(["research"]);
  });

  it("requires an explicitly chosen draft account to remain connected", () => {
    const selected: FlowGraphDoc = { ...graph, nodes: graph.nodes.map((node) => node.id === "draft" ? { ...node, config: { platform: "linkedin", accountId: "old-account" } } : node) };
    const issues = checkActivationReadiness(selected, {
      keys: [{ provider: "exa", status: "active" }, { provider: "openai", status: "active" }],
      accounts: [], env: {},
    });
    expect(issues.map((issue) => issue.nodeId)).toEqual(["draft"]);
  });

  it("uses the default X platform for a selected draft account", () => {
    const selected: FlowGraphDoc = { nodes: [{ id: "draft", type: "action.create_draft", config: { accountId: "6d623a78-d3d2-4990-974d-5b2312ac3a43" }, position: { x: 0, y: 0 } }], edges: [] };
    expect(checkActivationReadiness(selected, {
      keys: [], accounts: [{ id: "6d623a78-d3d2-4990-974d-5b2312ac3a43", platform: "x" }], env: {},
    })).toEqual([]);
  });

  it("checks AI Decision against TypeSafe rather than text model keys", () => {
    const decision: FlowGraphDoc = { nodes: [{ id: "choose", type: "ai.decision", config: {}, position: { x: 0, y: 0 } }], edges: [] };
    expect(checkActivationReadiness(decision, { keys: [{ provider: "openai", status: "active" }], accounts: [], env: {} }).map((issue) => issue.nodeId)).toEqual(["choose"]);
    expect(checkActivationReadiness(decision, { keys: [], accounts: [], env: { typesafe: true } })).toEqual([]);
  });
});
