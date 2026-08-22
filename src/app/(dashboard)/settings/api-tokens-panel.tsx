'use client';

import { useEffect, useState } from "react";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
  type PublicApiToken,
} from "@/app/actions/api-tokens";
import { CheckCircle2, Copy, Loader2, Plus, Trash2 } from "lucide-react";

const SCOPES = [
  { id: "read", label: "read", hint: "List accounts, drafts, posts", locked: true },
  { id: "write", label: "write", hint: "Create drafts", locked: false },
  { id: "approve", label: "approve", hint: "Approve / reject drafts", locked: false },
] as const;

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function ApiTokensPanel() {
  const [tokens, setTokens] = useState<PublicApiToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const res = await listApiTokens();
      setTokens(res.tokens);
    } catch {
      // unauthenticated or no workspace — leave list empty
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleScope(id: string) {
    if (id === "read") return; // always on
    setScopes((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function handleCreate() {
    setIsCreating(true);
    setCreateError(null);
    setNewSecret(null);
    try {
      const res = await createApiToken(name, scopes.includes("read") ? scopes : ["read", ...scopes]);
      if (res.error || !res.token) {
        setCreateError(res.error ?? "Failed to create token");
      } else {
        setNewSecret(res.token.secret);
        setName("");
        setScopes(["read"]);
        await load();
      }
    } catch (e: any) {
      setCreateError(e?.message ?? "Failed to create token");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    await revokeApiToken(id);
    setTokens((prev) => prev.filter((t) => t.id !== id));
  }

  function handleCopy() {
    if (!newSecret) return;
    void navigator.clipboard.writeText(newSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Create new token */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="api-token-name" className="block text-sm font-medium mb-1">
              Token name
            </label>
            <input
              id="api-token-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Zapier integration"
              maxLength={100}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate token
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {SCOPES.map((scope) => (
            <label
              key={scope.id}
              title={scope.hint}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                scopes.includes(scope.id)
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                  : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
              } ${scope.locked ? "cursor-default opacity-80" : ""}`}
            >
              <input
                type="checkbox"
                checked={scopes.includes(scope.id)}
                onChange={() => toggleScope(scope.id)}
                disabled={scope.locked}
                className="accent-indigo-600"
              />
              {scope.label}
              <span className="text-zinc-400 font-normal">{scope.hint}</span>
            </label>
          ))}
        </div>

        {createError && <p className="text-sm text-red-500">{createError}</p>}
      </div>

      {/* One-time secret display */}
      {newSecret && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-900/20 p-5 space-y-3">
          <p className="flex items-center gap-2 font-medium text-sm text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Token created — copy it now, you won&apos;t see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-white dark:bg-zinc-900 border px-3 py-2 text-xs font-mono">
              {newSecret}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Only a SHA-256 hash is stored server-side. Use it as{" "}
            <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>. See the{" "}
            <a href="/docs" target="_blank" rel="noopener noreferrer" className="underline">
              API docs
            </a>
            .
          </p>
        </div>
      )}

      {/* Token list */}
      {isLoading ? (
        <p className="text-sm text-zinc-500 flex items-center gap-2 py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tokens…
        </p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-zinc-500 py-2">
          No API tokens yet. Generate one above to call the REST API from scripts and integrations.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{token.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Created {dateFmt.format(new Date(token.createdAt))}
                  {token.lastUsedAt
                    ? ` · Last used ${dateFmt.format(new Date(token.lastUsedAt))}`
                    : " · Never used"}
                </p>
              </div>
              <div className="flex gap-1.5">
                {token.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-mono text-zinc-600 dark:text-zinc-300"
                  >
                    {scope}
                  </span>
                ))}
              </div>
              <button
                type="button"
                aria-label={`Revoke ${token.name}`}
                onClick={() => handleRevoke(token.id)}
                className="rounded-lg p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
