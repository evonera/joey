"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { activateThemePage, pauseThemePage } from "@/app/actions/theme-pages";
import { toast } from "sonner";
import { useWebMcpTools } from "@/hooks/use-webmcp-tools";
import {
  createThemeStudioWebMcpTools,
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
}

export function ThemePageHeader({ page, webMcpState }: ThemePageHeaderProps) {
  const pathname = usePathname();
  const [status, setStatus] = React.useState(page.status);
  const [loading, setLoading] = React.useState(false);
  const resolvedWebMcpState = React.useMemo<ThemeStudioWebMcpState>(() => {
    if (webMcpState) {
      return { ...webMcpState, page: { ...webMcpState.page, status } };
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
      },
      sources: [],
      slots: [],
      packages: [],
    };
  }, [page.id, page.name, page.niche, status, webMcpState]);
  const webMcpTools = React.useMemo(
    () => createThemeStudioWebMcpTools(() => resolvedWebMcpState),
    [resolvedWebMcpState],
  );
  const webMcpAvailable = useWebMcpTools(webMcpTools);

  const tabs = [
    { label: "Overview", href: `/theme-studio/${page.id}`, icon: IconLayoutDashboard },
    { label: "Sources", href: `/theme-studio/${page.id}/sources`, icon: IconRss },
    { label: "Daily Mix", href: `/theme-studio/${page.id}/mix`, icon: IconCalendar },
    { label: "Templates", href: `/theme-studio/${page.id}/templates`, icon: IconPalette },
    { label: "Preview Day", href: `/theme-studio/${page.id}/preview-day`, icon: IconEye },
    { label: "DM Funnels", href: `/theme-studio/${page.id}/dm-rules`, icon: IconMessageCircle },
    { label: "Settings", href: `/theme-studio/${page.id}/settings`, icon: IconSettings },
  ];

  async function handleToggleStatus() {
    setLoading(true);
    try {
      if (status === "active") {
        const res = await pauseThemePage(page.id);
        if (res.error) throw new Error(res.error);
        setStatus("paused");
        toast.success("Theme page paused");
      } else {
        const res = await activateThemePage(page.id);
        if (res.error) throw new Error(res.error);
        setStatus("active");
        toast.success("Theme page recipe activated");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-b bg-card">
      <div className="p-6 pb-0 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <IconSparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">{page.name}</h1>
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
                  {webMcpAvailable ? (
                    <span className="rounded-full border border-indigo-300 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-800 dark:text-indigo-300">
                      WebMCP ready
                    </span>
                  ) : null}
                </div>
                {page.niche && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Niche: <span className="font-medium text-foreground">{page.niche}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
                  <IconPlayerPause className="w-4 h-4" /> Pause Recipe
                </>
              ) : (
                <>
                  <IconPlayerPlay className="w-4 h-4" /> Activate Recipe
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 overflow-x-auto no-scrollbar">
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
