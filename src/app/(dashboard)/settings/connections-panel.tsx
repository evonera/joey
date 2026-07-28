"use client";

import { useState, useEffect, useCallback } from "react";
import { Plug, PlugZap, Loader2, ExternalLink, Trash2, Plus } from "lucide-react";

interface ConnectionItem {
  toolkit: string;
  accounts: {
    id: string;
    status: string;
    alias: string | null;
    label: string | null;
  }[];
}

export function ConnectionsPanel() {
  const [connections, setConnections] = useState<ConnectionItem[] | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [pendingToolkit, setPendingToolkit] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/connections")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { connections?: ConnectionItem[]; checked?: string[] } | null) => {
        if (body === null) {
          setFailed(true);
          setConnections([]);
          return;
        }
        const connected = new Set((body.connections ?? []).map((entry) => entry.toolkit));
        setConnections(body.connections ?? []);
        setAvailable((body.checked ?? []).filter((toolkit) => !connected.has(toolkit)));
      })
      .catch(() => {
        setFailed(true);
        setConnections([]);
      });
  }, []);

  useEffect(load, [load]);

  function connect(toolkit: string) {
    setPendingToolkit(toolkit);
    fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<{ url: string }>;
      })
      .then(({ url }) => {
        window.open(url, "_blank", "noopener");
      })
      .catch((error: unknown) => {
        alert(error instanceof Error ? error.message : "Connect failed");
      })
      .finally(() => setPendingToolkit(null));
  }

  function disconnect(toolkit: string, accountId: string) {
    setConnections(
      (prev) =>
        prev?.map((entry) =>
          entry.toolkit === toolkit
            ? { ...entry, accounts: entry.accounts.filter((account) => account.id !== accountId) }
            : entry,
        ) ?? null,
    );
    fetch("/api/connections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit, accountId }),
    });
  }

  return (
    <div className="space-y-4">
      {failed && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          Could not reach Composio. Check COMPOSIO_API_KEY and retry.
        </p>
      )}

      {connections === null && !failed && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      )}

      {connections !== null && connections.length === 0 && !failed && (
        <p className="py-4 text-sm text-zinc-500 text-center">
          No connected apps yet. Connect one below or ask Joey in chat.
        </p>
      )}

      {connections !== null && connections.filter((e) => e.accounts.length > 0).length > 0 && (
        <div className="space-y-2">
          {connections
            .filter((entry) => entry.accounts.length > 0)
            .map((entry) => (
              <div
                key={entry.toolkit}
                className="rounded-lg border bg-white p-3 dark:bg-zinc-900"
              >
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm font-medium capitalize">{entry.toolkit}</span>
                </div>
                {entry.accounts.map((account) => (
                  <div key={account.id} className="ml-6 mt-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                      {account.alias ?? account.label ?? account.id}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        account.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {account.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => disconnect(entry.toolkit, account.id)}
                      className="rounded p-1 text-zinc-400 hover:text-red-500"
                      title={`Disconnect ${entry.toolkit}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      {!failed && available.length > 0 && (
        <div>
          <div className="relative">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) connect(e.target.value);
                e.target.value = "";
              }}
              disabled={pendingToolkit !== null}
              className="w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            >
              <option value="">
                {pendingToolkit !== null ? "Opening…" : "Connect an app…"}
              </option>
              {available.map((toolkit) => (
                <option key={toolkit} value={toolkit}>
                  {toolkit.charAt(0).toUpperCase() + toolkit.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!failed && (
        <p className="text-xs text-zinc-400">
          Other apps can be connected by asking Joey in chat. This list covers common ones.
        </p>
      )}
    </div>
  );
}
