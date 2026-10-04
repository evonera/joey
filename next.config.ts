import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withEve } from "eve/next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { withScoutWorkflowRouting } from "./scripts/eve-scout-routing";
import { buildContentSecurityPolicies } from "./scripts/content-security-policy";

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
  output:
    process.env.NEXT_OUTPUT === "export"
      ? "export"
      : process.env.NEXT_OUTPUT === "server" || process.env.VERCEL
        ? undefined
        : "standalone",
  // resvg ships platform-native binaries and must remain a Node server
  // dependency instead of being bundled into Turbopack ESM chunks.
  serverExternalPackages: ["@resvg/resvg-js"],
  pageExtensions: ["ts", "tsx", "mdx"],
  async headers() {
    const { enforce: cspEnforce, reportOnly: cspReportOnly } = buildContentSecurityPolicies({
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    });

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
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/auth/login",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/auth/sign-in",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/auth/signup",
        destination: "/signup",
        permanent: true,
      },
      {
        source: "/auth/sign-up",
        destination: "/signup",
        permanent: true,
      },
      {
        source: "/auth/forgot-password",
        destination: "/forgot-password",
        permanent: true,
      },
      {
        source: "/auth/reset-password",
        destination: "/reset-password",
        permanent: true,
      },
      {
        source: "/auth/reset-link-sent",
        destination: "/reset-link-sent",
        permanent: true,
      },
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

export default withSentryConfig(withScoutWorkflowRouting(withEve(withMDX(withAnalyze(nextConfig)))), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
