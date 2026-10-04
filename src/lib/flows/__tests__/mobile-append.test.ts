import { describe, expect, it } from "vitest";
import { mobileAppendSource } from "../builder-state";
import type { FlowGraphDoc } from "../types";

const node = (id: string, type = "action.create_draft") => ({ id, type, config: {}, position: { x: 0, y: 0 } });
describe("safe mobile flow append", () => {
  it("starts an empty graph", () => expect(mobileAppendSource({ nodes: [], edges: [] })).toEqual({ ok: true }));
  it("follows topology instead of array ordering", () => {
    expect(mobileAppendSource({ nodes: [node("end"), node("start", "trigger.manual")], edges: [{ from: "start", to: "end" }] })).toEqual({ ok: true, sourceId: "end" });
  });
  it("allows linear research with multiple data outputs", () => {
    expect(mobileAppendSource({ nodes: [node("start", "trigger.manual"), node("research", "data.exa_search")], edges: [{ from: "start", to: "research" }] })).toEqual({ ok: true, sourceId: "research" });
  });
  it("rejects unknown node semantics", () => {
    expect(mobileAppendSource({ nodes: [node("unknown", "unknown.node")], edges: [] }).ok).toBe(false);
  });
  it.each(["logic.condition", "logic.split", "ai.decision"])("never adds an unconditional edge after %s", (type) => {
    const graph: FlowGraphDoc = { nodes: [node("branch", type)], edges: [] };
    expect(mobileAppendSource(graph).ok).toBe(false);
  });
  it("rejects disconnected nodes and cycle components", () => {
    expect(mobileAppendSource({ nodes: [node("a"), node("b")], edges: [] }).ok).toBe(false);
    expect(mobileAppendSource({ nodes: [node("a"), node("b"), node("c")], edges: [{ from: "b", to: "c" }, { from: "c", to: "b" }] }).ok).toBe(false);
  });
});
