import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { addScoutServiceRoute, withScoutWorkflowRouting } from "../../../../scripts/eve-scout-routing";
const require = createRequire(import.meta.url);

describe("Generated Vercel Scout dispatch routing", () => {
  it("adds the exact authenticated custom-channel route to actual installed Eve service output", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "joey-scout-routing-"));
    const eveRoot = dirname(require.resolve("eve/package.json"));
    const generator = await import(pathToFileURL(join(eveRoot, "dist/src/public/next/vercel-output-config.js")).href) as { ensureEveVercelOutputConfig: (input: unknown) => Promise<unknown> };
    vi.stubEnv("VERCEL", "1");
    try {
      await generator.ensureEveVercelOutputConfig({ nextRoot: temporaryRoot, agents: [{ appRoot: process.cwd(), buildCommand: "eve build", publicRoutePrefix: "", servicePrefix: "/_eve_internal/eve" }] });
      const configPath = await addScoutServiceRoute(temporaryRoot);
      const first = JSON.parse(await readFile(configPath, "utf8"));
      expect(first.services.eve.framework).toBe("eve");
      expect(first.routes[0]).toEqual({ src: "^/scout-dispatch$", destination: { type: "service", service: "eve" } });
      expect(first.routes.some((route: { src: string }) => route.src === "^/eve/v1/(.*)$")).toBe(true);
      await addScoutServiceRoute(temporaryRoot);
      expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual(first);
    } finally { vi.unstubAllEnvs(); await rm(temporaryRoot, { recursive: true, force: true }); }
  });
});

describe("Self-hosted Workflow callback routing", () => {
  it.each(["http://127.0.0.1:4274", "http://127.0.0.1:55221", "https://runtime.example/_eve_internal/eve"])("preserves callback paths at %s alongside existing rewrites", async origin => {
    vi.stubEnv("VERCEL", "");
    try {
      const protocol = { source: "/eve/v1/:path+", destination: `${origin}/eve/v1/:path+` };
      const after = { source: "/legacy", destination: "/new" };
      const config = await withScoutWorkflowRouting(async () => ({ rewrites: async () => ({ beforeFiles: [protocol], afterFiles: [after], fallback: [] }) }))("phase-production-build", { defaultConfig: {} });
      expect(await config.rewrites?.()).toEqual({
        beforeFiles: [{ source: "/.well-known/workflow/:path+", destination: `${origin}/.well-known/workflow/:path+` }, protocol],
        afterFiles: [after], fallback: [],
      });
    } finally { vi.unstubAllEnvs(); }
  });
});
