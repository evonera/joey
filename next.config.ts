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
  output: process.env.NEXT_OUTPUT === "export" ? "export" : "standalone",
  pageExtensions: ["ts", "tsx", "mdx"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload"
          }
        ],
      },
    ];
  },
};

export default withEve(withMDX(withAnalyze(nextConfig)));
