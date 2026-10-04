import { defineConfig } from "vitest/config";
import path from "node:path";

// Never discovered by ordinary npm test. Validate the operator-selected
// checkout and disposable database in the test module, not while importing
// configuration: static tools such as Knip load every Vitest config.

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/cloud-contract.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
