import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-4o-mini",
  build: {
    externalDependencies: ["@resvg/resvg-js"],
  },
});
