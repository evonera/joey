import { readFileSync } from "node:fs";
import { satisfiesStableCaret } from "./lib/dependency-compatibility.mjs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const failures = [];

for (const group of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(manifest[group] ?? {})) {
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
      failures.push(`${name}: direct dependency must have an exact version`);
    }
    if (lock.packages[`node_modules/${name}`]?.version !== version) {
      failures.push(`${name}: manifest and locked resolution disagree`);
    }
    if (lock.packages[""]?.[group]?.[name] !== version) {
      failures.push(`${name}: lockfile root is stale`);
    }
  }
}

// Check the runtime boundaries that legacy-peer-deps would otherwise hide.
// These dependencies publish stable caret ranges. Fail closed if that format
// changes so a new major release requires an explicit compatibility review.
function requireCaretCompatibility(owner, dependency, source = "peerDependencies") {
  const range = lock.packages[`node_modules/${owner}`]?.[source]?.[dependency];
  const actual = lock.packages[`node_modules/${dependency}`]?.version;
  if (!satisfiesStableCaret(actual, range)) {
    failures.push(`${owner} → ${dependency}: ${actual} does not satisfy ${range}`);
  }
}

requireCaretCompatibility("eve", "ai");
requireCaretCompatibility("eve", "microsandbox");
requireCaretCompatibility("@better-auth/core", "jose");
if (manifest.overrides?.ai !== "$ai") {
  failures.push("AI SDK override must reference the exact direct dependency with $ai");
}
if (manifest.overrides?.["@better-auth/core"]?.jose) {
  failures.push("Do not downgrade Better Auth's Jose implementation through an override");
}
for (const name of ["@next/mdx", "eslint-config-next", "@next/bundle-analyzer"]) {
  const version = manifest.dependencies[name] ?? manifest.devDependencies[name];
  if (version !== manifest.dependencies.next) failures.push(`${name}: must match Next.js`);
}
if (manifest.dependencies.react !== manifest.dependencies["react-dom"]) {
  failures.push("React and React DOM must use the same exact release");
}
if (Number(process.versions.node.split(".")[0]) < 24) {
  failures.push("Eve requires Node.js 24 or newer; use the project's Node 24 LTS runtime");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Dependency pins, lockfile, and core runtime compatibility verified.");
}
