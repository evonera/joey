'use client';

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft01Icon as ArrowLeft, Download01Icon as Download } from "hugeicons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { installTemplate, listTemplates, type TemplateCard } from "@/app/actions/flows";

export default function FlowTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listTemplates();
      setTemplates(res.templates);
    } catch {
      toast.error("Failed to load templates");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleInstall(id: string) {
    setInstalling(id);
    try {
      const res = await installTemplate(id);
      if (res.flowId) {
        toast.success("Template installed — it's yours to edit");
        router.push(`/flows/${res.flowId}`);
      } else toast.error(res.error ?? "Install failed");
    } finally {
      setInstalling(null);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto pb-24">
      <Link href="/flows" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> All flows
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Flow templates</h1>
        <p className="text-muted-foreground mt-1">
          One-click automations built by us and the community. Install, tweak, run.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((t) => (
          <div key={t.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>
              {t.isOfficial && <Badge className="text-[10px]">Official</Badge>}
            </div>
            <h2 className="font-semibold">{t.name}</h2>
            {t.description && <p className="mt-1 text-sm text-muted-foreground flex-1">{t.description}</p>}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t.installs} installs</span>
              <Button size="sm" disabled={installing === t.id} onClick={() => handleInstall(t.id)}>
                <Download className="mr-1 h-3.5 w-3.5" />
                {installing === t.id ? "Installing…" : "Install"}
              </Button>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full py-8">Loading templates…</p>
        )}
      </div>
    </div>
  );
}
