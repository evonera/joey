'use client';

import { useState, useEffect } from "react";
import { getBrandKit, reindexMemories } from "@/app/actions/brandkit";
import { getAgentConfig, saveAgentConfig } from "@/app/actions/agent";
import {
  Loading03Icon as Loader2,
  RefreshIcon as RefreshCw,
  Book02Icon as BookOpen,
  Comment01Icon as MessageSquare,
  CheckmarkCircle02Icon as CheckCircle2,
  File02Icon as FileText,
  FloppyDiskIcon as Save,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function BrandKitPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexSuccess, setReindexSuccess] = useState(false);
  const [reindexError, setReindexError] = useState<string | null>(null);

  const [brandVoice, setBrandVoice] = useState("");
  const [postingGoals, setPostingGoals] = useState("");
  const [currentSchedule, setCurrentSchedule] = useState<any>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [data, setData] = useState<{
    config: { brandVoice: string | null; postingGoals: string | null } | null;
    memories: { id: string; content: string; type: string; createdAt: Date; metadata: unknown }[];
    summary: { total: number; byType: Record<string, number> };
  } | null>(null);

  useEffect(() => {
    async function load() {
      const [brandRes, agentRes] = await Promise.all([
        getBrandKit(),
        getAgentConfig(),
      ]);

      if (!brandRes.error && brandRes.summary) {
        setData(brandRes as any);
      }

      if (agentRes.config) {
        setBrandVoice(agentRes.config.brandVoice || "");
        setPostingGoals(agentRes.config.postingGoals || "");
        setCurrentSchedule(agentRes.config.postingSchedule);
      }
      setIsLoading(false);
    }
    load();
  }, []);

  const handleSaveGuidelines = async () => {
    setIsSavingConfig(true);
    setConfigSaved(false);
    try {
      const res = await saveAgentConfig({
        brandVoice,
        postingGoals,
        postingSchedule: currentSchedule || {
          timezone: "UTC",
          activeDays: ["mon", "tue", "wed", "thu", "fri"],
          times: ["09:00", "15:00"],
          selectedAccountIds: [],
        },
      });

      if (res.success) {
        setConfigSaved(true);
        toast.success("Brand guidelines saved");
        setTimeout(() => setConfigSaved(false), 3000);
      } else {
        toast.error(res.error || "Failed to save guidelines");
      }
    } catch {
      toast.error("Failed to save guidelines");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    setReindexSuccess(false);
    setReindexError(null);
    const res = await reindexMemories();
    if (res.success) {
      const fresh = await getBrandKit();
      if (!fresh.error && fresh.summary) {
        setData(fresh as any);
      }
      setReindexSuccess(true);
      toast.success("Memories successfully re-indexed");
      setTimeout(() => setReindexSuccess(false), 3000);
    } else if (res.error) {
      setReindexError(res.error);
      toast.error(res.error);
    }
    setIsReindexing(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Brand Kit</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure your brand voice, content guidelines, and vector memory retrieval.
          </p>
        </div>
        <Button
          onClick={handleReindex}
          disabled={isReindexing}
          variant="secondary"
          size="sm"
          className="gap-2"
        >
          {isReindexing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : reindexSuccess ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {reindexSuccess ? "Re-indexed" : "Re-index Memories"}
        </Button>
      </div>

      {reindexError && (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          {reindexError}
        </div>
      )}

      {/* Metric Cards */}
      {data?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 shadow-xs">
            <div className="flex items-center gap-3 mb-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <p className="text-xs text-muted-foreground font-medium">Total Memories</p>
            </div>
            <p className="text-3xl font-semibold tabular-nums text-foreground">{data.summary.total}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 shadow-xs">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-5 w-5 text-emerald-500" />
              <p className="text-xs text-muted-foreground font-medium">Brand Guidelines</p>
            </div>
            <p className="text-3xl font-semibold tabular-nums text-foreground">{data.summary.byType["brand_guideline"] ?? 0}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 shadow-xs">
            <div className="flex items-center gap-3 mb-2">
              <MessageSquare className="h-5 w-5 text-amber-500" />
              <p className="text-xs text-muted-foreground font-medium">Published Posts</p>
            </div>
            <p className="text-3xl font-semibold tabular-nums text-foreground">{data.summary.byType["published_post"] ?? 0}</p>
          </div>
        </div>
      )}

      {/* Editable Brand Voice & Strategy */}
      <section className="bg-card rounded-xl border border-border overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm text-foreground">Brand Voice & Content Strategy</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Joey references these instructions when autonomously drafting posts and responding to audience replies.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSaveGuidelines}
            disabled={isSavingConfig}
            className="gap-1.5 shrink-0"
          >
            {isSavingConfig ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : configSaved ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {configSaved ? "Saved" : "Save Guidelines"}
          </Button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Brand Voice & Persona</label>
            <p className="text-[11px] text-muted-foreground">
              Define the tone, sentence style, vocabulary, and perspective (e.g. conversational, technical, minimal emojis).
            </p>
            <Textarea
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              placeholder="e.g. Professional yet conversational. Direct sentences with high information density. Focus on actionable insights for engineers."
              rows={4}
              className="resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Posting Goals & Editorial Themes</label>
            <p className="text-[11px] text-muted-foreground">
              Specify what content Joey should prioritize (e.g. product build-in-public updates, technical deep dives, weekly recaps).
            </p>
            <Textarea
              value={postingGoals}
              onChange={(e) => setPostingGoals(e.target.value)}
              placeholder="e.g. Drive awareness for our open-source tools. Share 1 architectural case study, 1 quick terminal tip, and 1 community highlight each week."
              rows={4}
              className="resize-y"
            />
          </div>
        </div>
      </section>

      {/* Indexed Memories */}
      <section className="bg-card rounded-xl border border-border overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-sm text-foreground">Indexed Vector Memories</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            High-dimensional embeddings used by the agent during live hybrid search.
          </p>
        </div>
        <div className="p-6">
          {!data?.memories || data.memories.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center max-w-md mx-auto space-y-2">
              <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="font-medium text-foreground text-sm">No memories indexed yet</p>
              <p>
                Save your brand guidelines above and click &quot;Re-index Memories&quot; to vectorize your voice and past published posts.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.memories.map((m) => (
                <div key={m.id} className="flex items-start gap-3 p-3.5 border border-border rounded-lg bg-background/60">
                  <span className={`mt-0.5 flex-shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    m.type === "brand_guideline"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                  }`}>
                    {m.type === "brand_guideline" ? "Guideline" : "Post"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-relaxed line-clamp-2">{m.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(m.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
