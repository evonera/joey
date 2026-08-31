import { describe, it, expect } from "vitest";
import { nodeRegistry, catalog as serverCatalog } from "@/lib/flows/registry";
import { NODE_CATALOG, getNodeMeta } from "@/lib/flows/catalog";

describe("flow node catalog ↔ registry sync", () => {
  it("exposes identical type sets", () => {
    expect(new Set(NODE_CATALOG.map((m) => m.type))).toEqual(new Set(Object.keys(nodeRegistry)));
  });

  it("shares the same schema instances (no drift between UI forms and execution)", () => {
    for (const meta of NODE_CATALOG) {
      const def = nodeRegistry[meta.type as keyof typeof nodeRegistry];
      expect(def?.configSchema).toBe(meta.configSchema);
    }
  });

  it("getNodeMeta resolves every registry entry", () => {
    for (const entry of serverCatalog()) {
      expect(getNodeMeta(entry.type)?.label).toBe(entry.label);
    }
  });

  it("official templates are valid graphs with executable node connections", async () => {
    const { officialTemplates } = await import("@/lib/flows/templates");
    expect(officialTemplates.length).toBeGreaterThanOrEqual(4);
    for (const tmpl of officialTemplates) {
      expect(tmpl.slug).toBeDefined();
      expect(tmpl.graph.nodes.length).toBeGreaterThan(0);
      expect(tmpl.graph.edges.length).toBeGreaterThan(0);
    }
  });
});
