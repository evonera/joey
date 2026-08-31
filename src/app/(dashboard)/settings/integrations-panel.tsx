'use client';

import { useEffect, useState } from "react";
import { getApiKey, saveApiKey, deleteApiKey } from "@/app/actions/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const INTEGRATIONS = [
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
      await saveApiKey(provider, inputs[provider]);
      setExisting((e) => ({ ...e, [provider]: true }));
      setInputs((v) => ({ ...v, [provider]: "" }));
      toast.success("Key saved — stored encrypted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(provider: string) {
    await deleteApiKey(provider);
    setExisting((e) => ({ ...e, [provider]: false }));
    toast.success("Key removed");
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
              <Button size="sm" variant="ghost" onClick={() => handleDelete(i.provider)} aria-label={`Remove ${i.label} key`}>
                <Trash2 className="h-3.5 w-3.5" />
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
