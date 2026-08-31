import { createHash } from "node:crypto";
import { splitConfig } from "../../catalog";
import { defineNode } from "../../node-contract";

export const splitNode = defineNode({
  type: "logic.split", category: "logic", label: "A/B split", description: "Deterministically routes each run to branch a or b.",
  inputs: ["data"], outputs: ["a", "b"], configSchema: splitConfig,
  async execute(input, rawConfig, ctx) {
    const config = splitConfig.parse(rawConfig);
    const seed = `${ctx.tenantId}:${ctx.flowId ?? "flow"}:${ctx.runId ?? "run"}:${ctx.nodeId ?? "split"}:${ctx.itemKey ?? "root"}`;
    const roll = createHash("sha256").update(seed).digest().readUInt32BE(0) % 100;
    return { output: input, branch: roll < config.aWeightPercent ? "a" : "b" };
  },
});
