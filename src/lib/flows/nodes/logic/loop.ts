import { defineNode } from "../../node-contract";
import { loopConfig } from "../../catalog";

const configSchema = loopConfig;

/**
 * For-each: the executor fans out — it runs every downstream node once per
 * array item and aggregates the chain's final outputs back into one array.
 */
export const loopNode = defineNode({
  type: "logic.loop",
  category: "logic",
  label: "For each item",
  description:
    "Runs everything downstream once per item of the incoming array, then merges each branch's results into a single list.",
  inputs: ["items"],
  outputs: ["item"],
  forEach: true,
  configSchema,
  async execute(input, rawConfig) {
    const config = configSchema.parse(rawConfig);
    if (!Array.isArray(input)) {
      throw new Error("For-each expects an array upstream.");
    }
    return { output: config.maxItems ? input.slice(0, config.maxItems) : input };
  },
});
