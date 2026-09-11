'use client';

import { useEffect, useState } from "react";
import { getApiKey, saveApiKey, deleteApiKey } from "@/app/actions/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckmarkCircle02Icon as CheckCircle2, Loading03Icon as Loader2, Delete02Icon as Trash2 } from "hugeicons-react";
import { toast } from "sonner";

const INTEGRATIONS = [
  { provider: "zernio", label: "Zernio", placeholder: "sk_…", url: "https://zernio.com/dashboard/api-keys", hint: "Social account connections, publishing, analytics, and inbox" },
  { provider: "openrouter", label: "OpenRouter", placeholder: "sk-or-v1-…", url: "https://openrouter.ai/settings/keys", hint: "Multiple LLM providers through one key" },
  { provider: "supadata", label: "Supadata", placeholder: "Supadata API key", url: "https://supadata.ai/dashboard", hint: "YouTube transcript extraction" },
  { provider: "apify", label: "Apify", placeholder: "apify_api_…", url: "https://console.apify.com/settings/integrations", hint: "Scrapers (Instagram, TikTok, LinkedIn…)" },
  { provider: "exa", label: "Exa", placeholder: "Exa API key", url: "https://dashboard.exa.ai/api-keys", hint: "Neural web research" },
  { provider: "tavily", label: "Tavily", placeholder: "tvly-…", url: "https://app.tavily.com/home", hint: "Fast web search + answers" },
] as const;

export function IntegrationsPanel() {
  const [existing, setExisting] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const next: Record<string, boolean> = {};
      for (const i of INTEGRATIONS) {
        try {
          const res = await getApiKey(i.provider);
          next[i.provider] = Boolean(res?.id);
        } catch {
          next[i.provider] = false;
        }
      }
      setExisting(next);
    })();
  }, []);

  async function handleSave(provider: string) {
    setSaving(provider);
    try {
      const key = inputs[provider]?.trim();
      if (!key) return;

      if (provider === "zernio") {
        const response = await fetch("/api/validate-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: key }),
        });
        const result = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) throw new Error(result?.error || "Zernio could not validate this key.");
      } else {
        const result = await saveApiKey(provider, key);
        if (result?.error) throw new Error(result.error);
      }

      setExisting((e) => ({ ...e, [provider]: true }));
      setInputs((v) => ({ ...v, [provider]: "" }));
      toast.success(provider === "zernio" ? "Zernio connected — key verified and encrypted" : "Key saved — stored encrypted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(provider: string) {
    setSaving(provider);
    try {
      const result = await deleteApiKey(provider);
      if (result?.error) throw new Error(result.error);
      setExisting((e) => ({ ...e, [provider]: false }));
      toast.success(provider === "zernio" ? "Zernio disconnected and linked accounts deactivated" : "Key removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Removal failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      {INTEGRATIONS.map((i) => (
        <div key={i.provider} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                {i.label}
                {existing[i.provider] && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              </p>
              <p className="text-xs text-zinc-500">{i.hint}</p>
            </div>
            {existing[i.provider] && (
              <Button size="sm" variant="ghost" disabled={saving === i.provider} onClick={() => handleDelete(i.provider)} aria-label={`Remove ${i.label} key`}>
                {saving === i.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder={existing[i.provider] ? "Replace existing key" : i.placeholder}
              value={inputs[i.provider] ?? ""}
              onChange={(e) => setInputs((v) => ({ ...v, [i.provider]: e.target.value }))}
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              disabled={!inputs[i.provider]?.trim() || saving === i.provider}
              onClick={() => handleSave(i.provider)}
            >
              {saving === i.provider ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Get one at{" "}
            <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              {new URL(i.url).hostname}
            </a>
            . Stored AES-256-GCM encrypted.
          </p>
        </div>
      ))}
    </div>
  );
}
