import crypto from "crypto";
import { defineNode } from "../../node-contract";
import { splitConfig } from "../../catalog";

export const splitNode = defineNode({
  type: "logic.split",
  category: "logic",
  label: "A/B split",
  description: "Randomly routes the flow down branch 'a' or 'b' with your chosen weighting — for A/B testing hooks and variants.",
  inputs: ["data"],
  outputs: ["a", "b"],
  configSchema: splitConfig,
  async execute(input, rawConfig) {
    const config = splitConfig.parse(rawConfig);
    const roll = crypto.randomInt(0, 100);
    const branch = roll < config.aWeightPercent ? "a" : "b";
    return { output: input, branch };
  },
});
