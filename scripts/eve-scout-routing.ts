import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EveNextConfigFunction } from "eve/next";

async function closestDirectory(start: string, directory: string, marker: string) {
  let current = start;
  for (;;) {
    try { if ((await stat(join(current, directory, marker))).isFile()) return join(current, directory); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
export async function addScoutServiceRoute(nextRoot = process.cwd()) {
  // Match Eve0.50's generated output-location discovery. Its default service
  // router exposes only /eve/v1/*; custom channels need a separate exact route.
  const output = await closestDirectory(nextRoot, "output", "builds.json");
  const linked = await closestDirectory(nextRoot, ".vercel", "project.json");
  const configPath = output ? join(output, "config.json") : join(linked ?? join(nextRoot, ".vercel"), "output", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as { version: number; services?: Record<string, { framework?: string }>; routes?: Array<Record<string, unknown>> };
  if (config.services?.eve?.framework !== "eve") throw new Error("Scout dispatch requires the generated unnamed Eve service.");
  const route = { src: "^/scout-dispatch$", destination: { type: "service", service: "eve" } };
  const routes = [route, ...(config.routes ?? []).filter((entry) => entry.src !== route.src)];
  if (JSON.stringify(routes) !== JSON.stringify(config.routes)) await writeFile(configPath, `${JSON.stringify({ ...config, routes }, null, 2)}\n`);
  return configPath;
}
export function withScoutWorkflowRouting(config: EveNextConfigFunction): EveNextConfigFunction {
  return async (phase, context) => {
    const resolved = await config(phase, context);
    if (process.env.VERCEL) await addScoutServiceRoute();
    return resolved;
  };
}
