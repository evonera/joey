import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const targetFile = resolve(
  process.cwd(),
  "node_modules/eve/dist/src/internal/workflow-bundle/authored-workflow-modules.js"
);

if (existsSync(targetFile)) {
  let content = readFileSync(targetFile, "utf8");
  const patchedEntry = "`node_modules`,`repos`";
  const candidates = ["`node_modules`])", "`node_modules`]);"];

  if (!content.includes(patchedEntry)) {
    const targetNeedle = candidates.find((candidate) => content.includes(candidate));
    if (!targetNeedle) {
      throw new Error(
        "[patch-eve] Eve's workflow ignore-list format changed; update this compatibility patch before building.",
      );
    }
    content = content.replace(
      targetNeedle,
      targetNeedle.replace("`node_modules`", patchedEntry),
    );
    writeFileSync(targetFile, content, "utf8");
    console.log("✓ [patch-eve] Added `repos` to Eve workflow ignore list.");
  }
}
