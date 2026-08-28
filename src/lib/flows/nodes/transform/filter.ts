import { z } from "zod";
import { defineNode } from "../../node-contract";
import { filterConfig } from "../../catalog";

const configSchema = filterConfig;

export const filterNode = defineNode({
  type: "transform.filter",
  category: "transform",
  label: "Filter",
  description: "Keeps array items matching a condition. Non-array input passes through unchanged.",
  inputs: ["items"],
  outputs: ["items"],
  configSchema,
  async execute(input, rawConfig) {
    const config = configSchema.parse(rawConfig);
    if (!Array.isArray(input)) return { output: input };

    const kept = input.filter((item) => matches(item, config));
    return { output: kept };
  },
});

function matches(item: unknown, config: z.infer<typeof configSchema>): boolean {
  const actual = getField(item, config.field);

  if (config.operator === "exists") return actual !== undefined;
  if (actual === undefined) return false;

  const asNum = (v: unknown) => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && !Number.isNaN(n) ? n : null;
  };
  const a = asNum(actual);
  const b = asNum(config.value ?? "");

  switch (config.operator) {
    case "eq":
      return a !== null && b !== null ? a === b : String(actual) === String(config.value);
    case "neq":
      return a !== null && b !== null ? a !== b : String(actual) !== String(config.value);
    case "gt":
      return a !== null && b !== null ? a > b : false;
    case "gte":
      return a !== null && b !== null ? a >= b : false;
    case "lt":
      return a !== null && b !== null ? a < b : false;
    case "lte":
      return a !== null && b !== null ? a <= b : false;
    case "contains":
      return String(actual).toLowerCase().includes(String(config.value ?? "").toLowerCase());
  }
}

export function getField(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
