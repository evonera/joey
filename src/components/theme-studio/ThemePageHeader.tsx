"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  IconSparkles, 
  IconPlayerPlay, 
  IconPlayerPause, 
  IconRss, 
  IconCalendar, 
  IconPalette, 
  IconEye, 
  IconMessageCircle, 
  IconSettings,
  IconLayoutDashboard,
  IconLoader2
} from "@tabler/icons-react";
import type { ThemeRecipeMode } from "@/lib/flows/theme-recipe-mode";
import { activateThemePage, pauseThemePage } from "@/app/actions/theme-pages";
import { toast } from "sonner";
import { useWebMcpTools } from "@/hooks/use-webmcp-tools";
import {
  createThemeStudioWebMcpTools,
  getThemeStudioReadinessIssues,
  type ThemeStudioWebMcpState,
} from "@/lib/theme-studio/webmcp/theme-studio-tools";

interface ThemePageHeaderProps {
  page: {
    id: string;
    name: string;
    niche?: string | null;
    status: string;
    recipeRevision: number;
    lastCompiledAt?: Date | string | null;
  };
  webMcpState?: ThemeStudioWebMcpState;
  executionMode?: ThemeRecipeMode;
}

export function ThemePageHeader({ page, webMcpState, executionMode = "draft_only" }: ThemePageHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = React.useState(page.status);
  const [mode, setMode] = React.useState<ThemeRecipeMode>(executionMode);
  React.useEffect(() => { setStatus(page.status); setMode(executionMode); }, [page.status, executionMode]);
  const [loading, setLoading] = React.useState(false);
  const [activationError, setActivationError] = React.useState<string | null>(null);
  const resolvedWebMcpState = React.useMemo<ThemeStudioWebMcpState>(() => {
    if (webMcpState) {
      return { ...webMcpState, page: { ...webMcpState.page, status, executionMode: mode } };
    }
    return {
      page: {
        id: page.id,
        name: page.name,
        niche: page.niche ?? null,
        audience: null,
        status,
        rightsPolicy: "strict",
        connectedAccountCount: 0,
        connectedPlatforms: [],
        executionMode: mode,
      },
      sources: [],
      slots: [],
      packages: [],
    };
  }, [page.id, page.name, page.niche, status, mode, webMcpState]);
  const webMcpTools = React.useMemo(
    () => createThemeStudioWebMcpTools(() => resolvedWebMcpState),
    [resolvedWebMcpState],
  );
  useWebMcpTools(webMcpTools);
  const readinessIssues = getThemeStudioReadinessIssues(resolvedWebMcpState);

  const tabs = [
    { label: "Overview", href: `/theme-studio/${page.id}`, icon: IconLayoutDashboard },
    { label: "Sources", href: `/theme-studio/${page.id}/sources`, icon: IconRss },
    { label: "Daily Mix", href: `/theme-studio/${page.id}/mix`, icon: IconCalendar },
    { label: "Templates", href: `/theme-studio/${page.id}/templates`, icon: IconPalette },
    { label: "Preview Day", href: `/theme-studio/${page.id}/preview-day`, icon: IconEye },
    { label: "DM Automation", href: `/theme-studio/${page.id}/dm-rules`, icon: IconMessageCircle },
    { label: "Settings", href: `/theme-studio/${page.id}/settings`, icon: IconSettings },
  ];
  const selectedTab = tabs.find((tab) => tab.href === pathname)?.href ??
    tabs.slice(1).find((tab) => pathname.startsWith(`${tab.href}/`))?.href ?? tabs[0].href;

  async function handleToggleStatus() {
    setLoading(true);
    setActivationError(null);
    try {
      if (status === "active") {
        const res = await pauseThemePage(page.id);
        if (res.error) throw new Error(res.error);
        setStatus("paused");
        toast.success("Theme page paused");
      } else {
        const res = await activateThemePage(page.id, mode);
        if (res.error) throw new Error(res.error);
        setStatus("active");
        toast.success(mode === "draft_only" ? "Draft generation enabled" : "Theme page automation activated");
        router.refresh();
      }
    } catch (err: any) {
      const message = err.message || "Failed to update status";
      setActivationError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-b bg-card">
      <div className="min-w-0 max-w-7xl mx-auto px-4 pt-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <IconSparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight break-words [overflow-wrap:anywhere]">{page.name}</h1>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                      status === "active"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : status === "paused"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {status}
                  </span>
                </div>
                {page.niche && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Niche: <span className="font-medium text-foreground">{page.niche}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {status !== "active" && <label className="text-xs font-medium">Generation mode
              <select aria-label="Generation mode" value={mode} disabled={loading} onChange={(event) => setMode(event.target.value as ThemeRecipeMode)} className="ml-2 rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="draft_only">Drafts only</option>
                <option value="publishing">With publishing accounts</option>
              </select>
            </label>}
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ${
                status === "active"
                  ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {loading ? (
                <IconLoader2 className="w-4 h-4 animate-spin" />
              ) : status === "active" ? (
                <>
                  <IconPlayerPause className="w-4 h-4" /> Pause Automation
                </>
              ) : (
                <>
                  <IconPlayerPlay className="w-4 h-4" /> {mode === "draft_only" ? "Enable Draft Generation" : "Activate Automation"}
                </>
              )}
            </button>
          </div>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">{mode === "draft_only" ? "Drafts only: generate and review content before connecting a publishing account." : "Connected-account mode: matching publishing accounts are required."} Recipes run once per day. Approval and publication remain separate actions.</p>

        {status !== "active" && readinessIssues.length > 0 && (
          <div role="status" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="font-semibold">Before this page can run</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              {readinessIssues.map((issue) => (
                <li key={issue}>{issue}.{" "}
                  <Link className="font-medium underline underline-offset-2" href={issue.includes("source") || issue.includes("rights") ? `/theme-studio/${page.id}/sources` : issue.includes("slot") ? `/theme-studio/${page.id}/mix` : `/theme-studio/${page.id}/settings`}>
                    Fix this
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {activationError && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{activationError}</p>}

        {/* Tab Navigation */}
        <label className="mb-3 block text-xs font-semibold sm:hidden">Theme Page section
          <select aria-label="Theme Page section" value={selectedTab} onChange={(event) => router.push(event.target.value)} className="mt-1 block w-full rounded-lg border bg-background px-3 py-2.5 text-sm">
            {tabs.map((tab) => <option key={tab.href} value={tab.href}>{tab.label}</option>)}
          </select>
        </label>
        <nav className="hidden space-x-1 overflow-x-auto sm:flex" aria-label="Theme Page sections">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
