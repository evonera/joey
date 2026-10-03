type CspEnvironment = { NODE_ENV?: string; VERCEL_ENV?: string };

// Exact origins documented by Vercel for its preview toolbar. Never apply them
// to production/custom environments or broaden script-src to all HTTPS sites.
// https://vercel.com/docs/vercel-toolbar/managing-toolbar#using-a-content-security-policy
const PREVIEW_TOOLBAR_SOURCES = {
  "script-src": ["https://vercel.live"],
  "connect-src": ["https://vercel.live", "wss://ws-us3.pusher.com"],
  "img-src": ["https://vercel.live", "https://vercel.com"],
  "frame-src": ["https://vercel.live"],
  "style-src": ["https://vercel.live"],
  "font-src": ["https://vercel.live", "https://assets.vercel.com"],
} as const;

export function buildContentSecurityPolicies(env: CspEnvironment) {
  // Turbopack/dev tooling needs eval; neither hosted preview nor production does.
  const isDev = env.NODE_ENV === "development";
  const isPreview = env.VERCEL_ENV === "preview";
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  const toolbar = (directive: keyof typeof PREVIEW_TOOLBAR_SOURCES) =>
    isPreview ? ` ${PREVIEW_TOOLBAR_SOURCES[directive].join(" ")}` : "";
  // frame-src otherwise falls back to default-src 'self'. Retain that effective
  // permission when explicitly allowing the toolbar's preview-only frame.
  const previewFrames = isPreview ? [`frame-src 'self'${toolbar("frame-src")}`] : [];

  // Enforced baseline keeps the existing permissive image/connect HTTPS policy.
  const enforce = [
    "default-src 'self'",
    `script-src ${scriptSrc}${toolbar("script-src")}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${toolbar("style-src")}`,
    `img-src 'self' blob: data: https:${toolbar("img-src")}`,
    `font-src 'self' data: https://fonts.gstatic.com${toolbar("font-src")}`,
    `connect-src 'self' https: wss://*.liveblocks.io${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}${toolbar("connect-src")}`,
    "media-src 'self' blob: data: https:",
    "worker-src 'self' blob:",
    ...previewFrames,
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  // Tightened candidate remains report-only: badge images, uploaded R2 assets,
  // social media previews, browser Liveblocks and Sentry ingestion.
  const reportOnly = [
    "default-src 'self'",
    `script-src ${scriptSrc}${toolbar("script-src")}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${toolbar("style-src")}`,
    `img-src 'self' blob: data: https://img.shields.io https://*.r2.cloudflarestorage.com https://pbs.twimg.com https://cdn.syndication.twimg.com https://media.licdn.com https://graph.facebook.com${toolbar("img-src")}`,
    `font-src 'self' data: https://fonts.gstatic.com${toolbar("font-src")}`,
    `connect-src 'self' https://*.liveblocks.io wss://*.liveblocks.io https://*.r2.cloudflarestorage.com https://*.ingest.sentry.io${toolbar("connect-src")}`,
    "media-src 'self' blob: data: https:",
    "worker-src 'self' blob:",
    ...previewFrames,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  return { enforce, reportOnly };
}
