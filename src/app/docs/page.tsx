import type { Metadata } from "next";
import Link from "next/link";
import { JoeyLogo } from "@/components/joey-logo";

export const metadata: Metadata = {
  title: "Developer API — Joey Docs",
  description:
    "Joey REST API reference: authenticate with Bearer tokens, list and create drafts, approve or reject drafts, and read published posts. Rate limited to 60 req/min.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "Joey Developer API",
    description:
      "REST API for managing Joey drafts, approvals, accounts, and published posts programmatically.",
    url: "/docs",
    type: "website",
  },
};

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-zinc-900 dark:bg-black border border-zinc-800 p-4 text-[13px] leading-relaxed text-zinc-100">
      <code>{children}</code>
    </pre>
  );
}

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/accounts", scope: "read", desc: "List connected social accounts." },
  { method: "GET", path: "/api/v1/drafts", scope: "read", desc: "List drafts. Optional ?status=pending_review filter." },
  { method: "POST", path: "/api/v1/drafts", scope: "write", desc: "Create a draft (status pending_review)." },
  { method: "POST", path: "/api/v1/drafts/approve", scope: "approve", desc: "Approve a draft. Optionally select an A/B variant." },
  { method: "POST", path: "/api/v1/drafts/reject", scope: "approve", desc: "Reject a draft with feedback for the agent." },
  { method: "GET", path: "/api/v1/posts", scope: "read", desc: "List published posts." },
];

const methodColor: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  POST: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      <header className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <JoeyLogo size="md" />
        <nav aria-label="Main navigation" className="flex items-center gap-4">
          <Link href="/blog" className="text-sm font-medium hover:text-indigo-600 transition-colors">Blog</Link>
          <a
            href="/api/openapi.json"
            className="text-sm font-medium hover:text-indigo-600 transition-colors"
          >
            OpenAPI spec
          </a>
          <Link href="/signup" className="text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
            Get Started
          </Link>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-14">
        <header>
          <h1 className="text-4xl font-extrabold tracking-tight mb-3">Developer API</h1>
          <p className="text-lg text-zinc-500 dark:text-zinc-400">
            Manage drafts, approvals, accounts, and published posts in your Joey workspace over
            HTTPS. Base URL:{" "}
            <code className="font-mono text-base bg-zinc-200/60 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
              https://joey.evonera.com
            </code>
          </p>
        </header>

        {/* Auth */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Authentication</h2>
          <ol className="list-decimal pl-5 space-y-2 text-zinc-600 dark:text-zinc-300 mb-5">
            <li>
              Open <strong>Settings → Developer API</strong> in your dashboard and generate a
              token. Pick the scopes you need.
            </li>
            <li>
              Copy the token when it is shown — it is stored hashed (SHA-256) and cannot be viewed again.
            </li>
            <li>Send it as a Bearer credential on every request.</li>
          </ol>
          <Code>{`curl https://joey.evonera.com/api/v1/drafts?status=pending_review \\
  -H "Authorization: Bearer joe_YOUR_TOKEN"`}</Code>
          <p className="text-sm text-zinc-500 mt-3">
            Tokens are workspace-scoped: every request acts on the workspace that owns the token,
            never across workspaces.
          </p>
        </section>

        {/* Scopes */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Scopes</h2>
          <div className="overflow-hidden rounded-xl border divide-y divide-zinc-200 dark:divide-zinc-800">
            {[
              ["read", "List accounts, drafts, and posts"],
              ["write", "Create drafts"],
              ["approve", "Approve or reject drafts"],
            ].map(([scope, desc]) => (
              <div key={scope} className="flex items-center gap-4 px-5 py-3 bg-white dark:bg-zinc-900">
                <code className="font-mono text-sm rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">{scope}</code>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Rate limits */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Rate limits</h2>
          <p className="text-zinc-600 dark:text-zinc-300 mb-0">
            60 requests per minute per token. Every response carries{" "}
            <code className="font-mono text-sm">X-RateLimit-Limit</code>,{" "}
            <code className="font-mono text-sm">X-RateLimit-Remaining</code>, and{" "}
            <code className="font-mono text-sm">X-RateLimit-Reset</code> headers. Exceeding the
            limit returns <code className="font-mono text-sm">429</code>.
          </p>
        </section>

        {/* Endpoints */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Endpoints</h2>
          <div className="space-y-3 mb-6">
            {ENDPOINTS.map((ep) => (
              <div key={`${ep.method} ${ep.path}`} className="rounded-xl border bg-white dark:bg-zinc-900 px-5 py-3.5 flex flex-wrap items-center gap-3">
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold font-mono ${methodColor[ep.method]}`}>
                  {ep.method}
                </span>
                <code className="font-mono text-sm">{ep.path}</code>
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{ep.desc}</span>
                  <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-mono text-zinc-500">
                    {ep.scope}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-sm text-zinc-500 mb-4">
            Machine-readable schema:{" "}
            <a href="/api/openapi.json" className="text-indigo-600 dark:text-indigo-400 hover:underline font-mono">
              /api/openapi.json
            </a>{" "}
            (paste into Swagger UI, Insomnia, or Postman).
          </p>
        </section>

        {/* Examples */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">Examples</h2>

          <div>
            <h3 className="font-semibold mb-2">Create a draft</h3>
            <Code>{`curl -X POST https://joey.evonera.com/api/v1/drafts \\
  -H "Authorization: Bearer joe_YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Big launch coming next week 👀",
    "scheduledFor": "2026-09-01T09:00:00Z"
  }'

# → { "draft": { "id": "…", "status": "pending_review", … } }`}</Code>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Approve a draft</h3>
            <Code>{`curl -X POST https://joey.evonera.com/api/v1/drafts/approve \\
  -H "Authorization: Bearer joe_YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "id": "DRAFT_ID" }'

# → { "success": true }`}</Code>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Reject with feedback</h3>
            <Code>{`curl -X POST https://joey.evonera.com/api/v1/drafts/reject \\
  -H "Authorization: Bearer joe_YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "id": "DRAFT_ID", "feedback": "Too salesy — keep it casual" }'`}</Code>
          </div>
        </section>

        {/* Errors */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Errors</h2>
          <div className="overflow-hidden rounded-xl border divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
            {[
              ["401", "Missing, invalid, or expired token — check the Authorization header"],
              ["403", "Token lacks the required scope — generate a new token with more scopes"],
              ["400", "Malformed request body or missing id"],
              ["429", "Rate limit exceeded — back off until X-RateLimit-Reset"],
            ].map(([code, desc]) => (
              <div key={code} className="flex items-center gap-4 px-5 py-3 bg-white dark:bg-zinc-900">
                <code className="font-mono font-semibold w-10 shrink-0">{code}</code>
                <span className="text-zinc-500 dark:text-zinc-400">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="p-8 rounded-2xl bg-indigo-600 text-white text-center">
          <h2 className="text-xl font-bold mb-2">Ready to build?</h2>
          <p className="mb-5 text-indigo-100 text-sm">
            Generate a token in Settings → Developer API and make your first call in under a minute.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-white text-indigo-700 px-6 py-3 rounded-full font-medium hover:bg-indigo-50 transition-colors"
          >
            Open dashboard
          </Link>
        </aside>
      </main>
    </div>
  );
}
