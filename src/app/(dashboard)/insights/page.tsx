'use client';

import { useState, useEffect } from "react";
import { getInsights } from "@/app/actions/insights";
import { Loading03Icon as Loader2, BulbIcon as Lightbulb, ChartAverageIcon as TrendingUp, Clock01Icon as Clock, Target02Icon as Target } from "hugeicons-react";

export default function InsightsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [insights, setInsights] = useState<{ id: string; content: string; createdAt: Date; metadata: unknown }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await getInsights();
      if (res.error) {
        setError(res.error);
      } else if (res.insights) {
        setInsights(res.insights);
      }
      setIsLoading(false);
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Strategy Insights</h1>
        <p className="text-muted-foreground mt-1">Weekly AI-powered analysis of your content performance and strategic recommendations</p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden mb-8">
        <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b flex items-center gap-2">
          <Clock className="h-4 w-4 text-zinc-400" />
          <h2 className="font-semibold text-zinc-900 dark:text-white">How It Works</h2>
        </div>
        <div className="p-6 text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
          <p>Every Sunday at 8 AM UTC, Joey reviews the past week&apos;s published posts, analyzes engagement metrics, and saves actionable strategy insights here.</p>
          <p>Insights cover: best posting times, top-performing content themes, platform-specific trends, and recommendations for the coming week.</p>
        </div>
      </div>

      {insights.length === 0 && !error ? (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
          <div className="p-12 text-center">
            <Lightbulb className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
            <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-2">No insights yet</p>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              The weekly strategy review runs every Sunday. After your first week of publishing, Joey will analyze performance and surface insights here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <div key={insight.id} className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">{insight.content}</p>
                    <p className="text-xs text-zinc-400 mt-3">
                      {insight.createdAt instanceof Date
                        ? insight.createdAt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                        : new Date(insight.createdAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {insights.length > 0 && (
        <div className="mt-8 bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b flex items-center gap-2">
            <Target className="h-4 w-4 text-zinc-400" />
            <h2 className="font-semibold text-zinc-900 dark:text-white">Summary</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <TrendingUp className="h-5 w-5 text-indigo-500" />
                <div>
                  <p className="text-sm text-zinc-500">Total Reviews</p>
                  <p className="text-xl font-bold">{insights.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-sm text-zinc-500">Latest Insight</p>
                  <p className="text-sm font-medium truncate">
                    {new Date(insights[0].createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <Clock className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm text-zinc-500">Review Cadence</p>
                  <p className="text-xl font-bold">Weekly</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
