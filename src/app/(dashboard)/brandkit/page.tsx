'use client';

import { useState, useEffect } from "react";
import { getBrandKit, reindexMemories } from "@/app/actions/brandkit";
import { Loading03Icon as Loader2, RefreshIcon as RefreshCw, Book02Icon as BookOpen, Comment01Icon as MessageSquare, CheckmarkCircle02Icon as CheckCircle2, File02Icon as FileText } from "hugeicons-react";

export default function BrandKitPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexSuccess, setReindexSuccess] = useState(false);
  const [data, setData] = useState<{
    config: { brandVoice: string | null; postingGoals: string | null } | null;
    memories: { id: string; content: string; type: string; createdAt: Date; metadata: unknown }[];
    summary: { total: number; byType: Record<string, number> };
  } | null>(null);

  useEffect(() => {
    async function load() {
      const res = await getBrandKit();
      if (!res.error && res.summary) {
        setData(res as any);
      }
      setIsLoading(false);
    }
    load();
  }, []);

  const handleReindex = async () => {
    setIsReindexing(true);
    setReindexSuccess(false);
    const res = await reindexMemories();
    if (res.success) {
      const fresh = await getBrandKit();
      if (!fresh.error && fresh.summary) {
        setData(fresh as any);
      }
      setReindexSuccess(true);
      setTimeout(() => setReindexSuccess(false), 3000);
    }
    setIsReindexing(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Brand Kit</h1>
          <p className="text-muted-foreground mt-1">Your brand assets, guidelines, and memory store</p>
        </div>
        <button
          onClick={handleReindex}
          disabled={isReindexing}
          className="flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {isReindexing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : reindexSuccess ? (
            <CheckCircle2 className="mr-2 h-4 w-4 text-green-300" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {reindexSuccess ? "Re-indexed!" : "Re-index Memories"}
        </button>
      </div>

      {data?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <BookOpen className="h-5 w-5 text-indigo-500" />
              <p className="text-sm text-zinc-500">Total Memories</p>
            </div>
            <p className="text-3xl font-bold">{data.summary.total}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-5 w-5 text-emerald-500" />
              <p className="text-sm text-zinc-500">Brand Guidelines</p>
            </div>
            <p className="text-3xl font-bold">{data.summary.byType["brand_guideline"] ?? 0}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <MessageSquare className="h-5 w-5 text-amber-500" />
              <p className="text-sm text-zinc-500">Published Posts</p>
            </div>
            <p className="text-3xl font-bold">{data.summary.byType["published_post"] ?? 0}</p>
          </div>
        </div>
      )}

      {data?.config && (
        <section className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden mb-8">
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Brand Voice & Strategy</h2>
          </div>
          <div className="p-6 space-y-4">
            {data.config.brandVoice && (
              <div>
                <p className="text-sm font-medium text-zinc-500 mb-1">Brand Voice</p>
                <p className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">{data.config.brandVoice}</p>
              </div>
            )}
            {data.config.postingGoals && (
              <div>
                <p className="text-sm font-medium text-zinc-500 mb-1">Posting Goals</p>
                <p className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">{data.config.postingGoals}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
        <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b">
          <h2 className="font-semibold text-zinc-900 dark:text-white">Indexed Memories</h2>
        </div>
        <div className="p-6">
          {!data?.memories || data.memories.length === 0 ? (
            <div className="text-sm text-zinc-500 py-4 text-center">
              No memories indexed yet. Click &quot;Re-index Memories&quot; to embed your brand guidelines and published posts.
            </div>
          ) : (
            <div className="space-y-3">
              {data.memories.map((m) => (
                <div key={m.id} className="flex gap-3 p-3 border rounded-lg">
                  <span className={`mt-0.5 flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    m.type === "brand_guideline"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  }`}>
                    {m.type === "brand_guideline" ? "Guideline" : "Post"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-900 dark:text-zinc-100 line-clamp-2">{m.content}</p>
                    <p className="text-xs text-zinc-400 mt-1">{new Date(m.createdAt).toLocaleDateString()}</p>
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
