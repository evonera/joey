"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getAnalytics } from "@/app/actions/analytics";
import { getInsights } from "@/app/actions/insights";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Loading03Icon as Loader2, 
  ChartAverageIcon as TrendingUp, 
  BulbIcon as Lightbulb, 
  Clock01Icon as Clock, 
  Target02Icon as Target,
  Analytics01Icon as AnalyticsIcon,
  File02Icon as FileIcon,
  ArrowRight01Icon as ArrowRight
} from "hugeicons-react";

import { SectionCards } from "@/components/section-cards";
import { PostPerformanceTable } from "@/components/post-performance-table";

// recharts is large; keep it off the initial dashboard bundle.
const AnalyticsCharts = dynamic(() => import("./analytics-charts"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-muted" />,
});

const RANGE_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

export default function AnalyticsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <AnalyticsDashboard />
    </Suspense>
  );
}

function AnalyticsDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") === "insights" ? "insights" : searchParams.get("tab") === "posts" ? "posts" : "overview";

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [days, setDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Extract<Awaited<ReturnType<typeof getAnalytics>>, { success: true }> | null>(null);

  const [insights, setInsights] = useState<{ id: string; content: string; createdAt: Date; metadata: unknown }[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(`/analytics${query ? `?${query}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    let active = true;
    async function load() {
      setIsLoading(true);
      setError(null);
      const res = await getAnalytics(days);
      if (!active) return;
      if (!res.success) {
        setError(res.error);
        setSnapshot(null);
      } else {
        setSnapshot(res);
      }
      setIsLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [days]);

  useEffect(() => {
    async function loadInsightsData() {
      setIsLoadingInsights(true);
      const res = await getInsights();
      if (res.error) {
        setInsightsError(res.error);
      } else if (res.insights) {
        setInsights(res.insights);
      }
      setIsLoadingInsights(false);
    }
    loadInsightsData();
  }, []);

  const latestInsight = insights.length > 0 ? insights[0] : null;

  return (
    <div className="p-8 max-w-6xl mx-auto pb-24 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics & Intelligence</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Live cross-platform engagement performance and weekly AI strategy intelligence.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted/80 rounded-lg border border-border/60 p-1 shadow-xs">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setDays(r.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                days === r.value
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full sm:w-auto grid-cols-3">
          <TabsTrigger value="overview" className="gap-2">
            <AnalyticsIcon className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="posts" className="gap-2">
            <FileIcon className="h-4 w-4" />
            Post Performance
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            AI Strategy Insights
            {insights.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/15 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                {insights.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {isLoading ? (
            <div className="flex h-[40vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-12 text-center">
              <TrendingUp className="h-12 w-12 text-destructive" />
              <p className="font-medium text-destructive">{error}</p>
              <p className="text-sm text-muted-foreground max-w-md">
                Make sure a valid Zernio API key is connected and the analytics add-on is enabled, then refresh.
              </p>
            </div>
          ) : snapshot ? (
            <>
              {latestInsight && (
                <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-foreground">Latest AI Strategy Memo</h3>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(latestInsight.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-2xl leading-relaxed">
                        {latestInsight.content}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTabChange("insights")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors border border-border shrink-0"
                  >
                    View All Memos
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <SectionCards summary={snapshot.summary} />
              <AnalyticsCharts series={snapshot.series} byPlatform={snapshot.byPlatform} />

              {!error && snapshot.success && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {snapshot.summary.lastSync ? `Last synced: ${new Date(snapshot.summary.lastSync).toLocaleString()}` : "Live data synced from Zernio"}
                </p>
              )}
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="posts" className="space-y-6">
          {isLoading ? (
            <div className="flex h-[40vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">
              {error}
            </div>
          ) : snapshot && snapshot.posts.length > 0 ? (
            <PostPerformanceTable posts={snapshot.posts} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-12 text-center">
              <TrendingUp className="h-12 w-12 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No posts recorded in this period</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Publish posts across connected platforms to track impression, comment, and conversion metrics here.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Automated Strategy Review Loop</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every Sunday at 8 AM UTC, Joey analyzes past published posts, calculates engagement velocity, and stores strategic recommendations.
            </p>
          </div>

          {isLoadingInsights ? (
            <div className="flex h-[30vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : insightsError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">
              {insightsError}
            </div>
          ) : insights.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
              <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="font-medium text-foreground text-base">No AI strategy memos yet</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                After your first week of scheduled publishing, Joey will analyze performance and surface recommendations here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {insights.map((insight) => (
                <div key={insight.id} className="rounded-xl border border-border bg-card p-6 shadow-xs transition-shadow hover:shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{insight.content}</p>
                      <p className="text-xs text-muted-foreground mt-3 font-medium">
                        {insight.createdAt instanceof Date
                          ? insight.createdAt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                          : new Date(insight.createdAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex items-center gap-3">
                  <Target className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Reviews</p>
                    <p className="text-lg font-bold text-foreground">{insights.length}</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex items-center gap-3">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Latest Memo</p>
                    <p className="text-sm font-semibold text-foreground truncate">
                      {new Date(insights[0].createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex items-center gap-3">
                  <Clock className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Cadence</p>
                    <p className="text-lg font-bold text-foreground">Weekly</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}


function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="border-b border-border px-6 py-4 flex items-center gap-2">
        <div>
          <h2 className="font-semibold text-foreground text-base">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}