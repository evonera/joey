import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withEve } from "eve/next";

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [["remark-gfm", {}]],
  },
});

// Run `ANALYZE=true npm run build` to emit bundle reports.
const withAnalyze = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  analyzerMode: "static",
});

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === "export" ? "export" : (process.env.VERCEL ? undefined : "standalone"),
  // resvg ships platform-native binaries and must remain a Node server
  // dependency instead of being bundled into Turbopack ESM chunks.
  serverExternalPackages: ["@resvg/resvg-js"],
  pageExtensions: ["ts", "tsx", "mdx"],
  async headers() {
    // Turbopack/dev tooling (React refresh, HMR) requires eval; production does not.
    const isDev = process.env.NODE_ENV === "development";
    const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

    // Enforced baseline. Kept intentionally permissive on img-src/connect-src
    // until the tightened Report-Only policy below has run clean in production.
    const cspEnforce = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'", // recharts/rbc inject inline styles
      "img-src 'self' blob: data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
    ].join("; ");

    // Tightened candidate (Phase 4.4): runs in report-only mode so violations
    // surface in the console without breaking anything. Enumerates every
    // external origin the browser legitimately talks to:
    //  - img.shields.io            GitHub star / MIT badges on the landing page
    //  - *.r2.cloudflarestorage.com uploaded assets served from Cloudflare R2
    //  - pbs.twimg.com / cdn.syndication.twimg.com / media.licdn.com /
    //    graph.facebook.com         social account avatars & post media previews
    // All API traffic (Zernio, LLM providers, Dodo Payments) is server-side,
    // so connect-src stays same-origin only.
    const cspReportOnly = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://img.shields.io https://*.r2.cloudflarestorage.com https://pbs.twimg.com https://cdn.syndication.twimg.com https://media.licdn.com https://graph.facebook.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: cspEnforce },
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload"
          }
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/pricing",
        destination: "/#pricing",
        permanent: false,
      },
      {
        source: "/features",
        destination: "/#features",
        permanent: false,
      },
    ];
  },
};

export default withEve(withMDX(withAnalyze(nextConfig)));
