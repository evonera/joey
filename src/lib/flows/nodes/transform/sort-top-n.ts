import { defineNode } from "../../node-contract";
import { sortTopNConfig } from "../../catalog";
import { getField } from "./filter";

const configSchema = sortTopNConfig;

export const sortTopNNode = defineNode({
  type: "transform.sort",
  category: "transform",
  label: "Sort / Top-N",
  description: "Sorts array items by a field and optionally keeps the top N.",
  inputs: ["items"],
  outputs: ["items"],
  configSchema,
  async execute(input, rawConfig) {
    const config = configSchema.parse(rawConfig);
    if (!Array.isArray(input)) return { output: input };

    const sorted = [...input].sort((a, b) => {
      const av = getField(a, config.field);
      const bv = getField(b, config.field);
      const an = Number(av);
      const bn = Number(bv);
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : (Number.isNaN(an) ? -Infinity : an) - (Number.isNaN(bn) ? -Infinity : bn);
      return config.direction === "asc" ? cmp : -cmp;
    });

    return { output: config.limit ? sorted.slice(0, config.limit) : sorted };
  },
});
