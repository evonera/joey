import { defineNode } from "../../node-contract";
import { conditionConfig } from "../../catalog";
import { getField } from "../transform/filter";

const configSchema = conditionConfig;

export const conditionNode = defineNode({
  type: "logic.condition",
  category: "logic",
  label: "Condition",
  description:
    "Branches the flow. Connect downstream edges from the 'true' or 'false' handle; non-matching branches are skipped.",
  inputs: ["data"],
  outputs: ["true", "false"],
  configSchema,
  async execute(input, rawConfig) {
    const config = configSchema.parse(rawConfig);
    const actual = getField(input, config.field);

    let passed: boolean;
    if (config.operator === "exists") {
      passed = actual !== undefined;
    } else if (actual === undefined) {
      passed = false;
    } else {
      const asNum = (v: unknown) => {
        const n = typeof v === "string" ? Number(v) : v;
        return typeof n === "number" && !Number.isNaN(n) ? n : null;
      };
      const a = asNum(actual);
      const b = asNum(config.value ?? "");
      switch (config.operator) {
        case "eq":
          passed = a !== null && b !== null ? a === b : String(actual) === String(config.value);
          break;
        case "neq":
          passed = a !== null && b !== null ? a !== b : String(actual) !== String(config.value);
          break;
        case "gt":
          passed = a !== null && b !== null && a > b;
          break;
        case "gte":
          passed = a !== null && b !== null && a >= b;
          break;
        case "lt":
          passed = a !== null && b !== null && a < b;
          break;
        case "lte":
          passed = a !== null && b !== null && a <= b;
          break;
        case "contains":
          passed = String(actual).toLowerCase().includes(String(config.value ?? "").toLowerCase());
          break;
      }
    }

    return { output: input, branch: passed ? "true" : "false" };
  },
});
