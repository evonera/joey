import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const targetFile = resolve(
  process.cwd(),
  "node_modules/eve/dist/src/internal/workflow-bundle/authored-workflow-modules.js"
);

if (existsSync(targetFile)) {
  let content = readFileSync(targetFile, "utf8");
  const targetNeedle = "node_modules`";
  const replacement = "node_modules`,`repos`";

  if (content.includes(targetNeedle) && !content.includes(replacement)) {
    content = content.replace(targetNeedle, replacement);
    writeFileSync(targetFile, content, "utf8");
    console.log("✓ [patch-eve] Added `repos` to Eve workflow ignore list.");
  }
}
