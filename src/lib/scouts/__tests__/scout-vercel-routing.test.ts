import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { addScoutServiceRoute } from "../../../../scripts/eve-scout-routing";
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
