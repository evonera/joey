import { defineNode } from "../../node-contract";
import { dedupeConfig } from "../../catalog";
import { getField } from "./filter";

const configSchema = dedupeConfig;

export const dedupeNode = defineNode({
  type: "transform.dedupe",
  category: "transform",
  label: "Dedupe",
  description: "Removes duplicate array items by a field value.",
  inputs: ["items"],
  outputs: ["items"],
  configSchema,
  async execute(input, rawConfig) {
    const config = configSchema.parse(rawConfig);
    if (!Array.isArray(input)) return { output: input };

    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const item of input) {
      const key = String(getField(item, config.field) ?? JSON.stringify(item));
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return { output: out };
  },
});
