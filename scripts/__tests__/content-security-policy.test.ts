import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicies } from "../content-security-policy";

const productionBaseline = {
  enforce: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss://*.liveblocks.io; media-src 'self' blob: data: https:; worker-src 'self' blob:; base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  reportOnly: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://img.shields.io https://*.r2.cloudflarestorage.com https://pbs.twimg.com https://cdn.syndication.twimg.com https://media.licdn.com https://graph.facebook.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.liveblocks.io wss://*.liveblocks.io https://*.r2.cloudflarestorage.com https://*.ingest.sentry.io; media-src 'self' blob: data: https:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
};

function directives(policy: string) {
  return Object.fromEntries(policy.split("; ").map((entry) => {
    const [name, ...sources] = entry.split(" ");
    return [name, sources];
  }));
}

describe("preview-only Vercel toolbar CSP", () => {
  it.each([undefined, "production", "development", "staging", "Preview", "preview "])(
    "preserves both production policies byte-for-byte outside exact preview (%s)",
    (VERCEL_ENV) => {
      expect(buildContentSecurityPolicies({ NODE_ENV: "production", VERCEL_ENV })).toEqual(productionBaseline);
    },
  );

  it("adds only the exact documented toolbar sources to both preview policies", () => {
    const policies = buildContentSecurityPolicies({ NODE_ENV: "production", VERCEL_ENV: "preview" });
    const additions: Record<string, string[]> = {
      "script-src": ["https://vercel.live"],
      "connect-src": ["https://vercel.live", "wss://ws-us3.pusher.com"],
      "img-src": ["https://vercel.live", "https://vercel.com"],
      "style-src": ["https://vercel.live"],
      "font-src": ["https://vercel.live", "https://assets.vercel.com"],
    };
    for (const name of ["enforce", "reportOnly"] as const) {
      const original = directives(productionBaseline[name]);
      const preview = directives(policies[name]);
      expect(Object.keys(preview).sort()).toEqual([...Object.keys(original), "frame-src"].sort());
      for (const [directive, sources] of Object.entries(original)) {
        expect(preview[directive]).toEqual([...sources, ...(additions[directive] ?? [])]);
      }
      expect(preview["frame-src"]).toEqual(["'self'", "https://vercel.live"]);
      expect(preview["script-src"]).toEqual(["'self'", "'unsafe-inline'", "https://vercel.live"]);
      expect(preview["frame-ancestors"]).toEqual(["'none'"]);
      expect(preview["object-src"]).toEqual(["'none'"]);
    }
  });

  it.each([undefined, "production", "test"])("never enables eval in a non-development preview (%s)", (NODE_ENV) => {
    const policies = buildContentSecurityPolicies({ NODE_ENV, VERCEL_ENV: "preview" });
    for (const policy of Object.values(policies)) expect(policy).not.toContain("'unsafe-eval'");
  });

  it("retains development-only eval and existing local HMR origins without toolbar origins", () => {
    const policies = buildContentSecurityPolicies({ NODE_ENV: "development" });
    for (const [name, policy] of Object.entries(policies)) {
      expect(directives(policy)["script-src"]).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
      expect(policy).not.toContain("vercel");
      expect(policy).not.toContain("pusher");
      expect(policy).toBe(productionBaseline[name as keyof typeof productionBaseline]
        .replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
        .replace("connect-src 'self' https: wss://*.liveblocks.io", "connect-src 'self' https: wss://*.liveblocks.io ws://localhost:* ws://127.0.0.1:*"));
    }
  });
});
