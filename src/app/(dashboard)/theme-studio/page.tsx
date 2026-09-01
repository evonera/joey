import * as React from "react";
import Link from "next/link";
import { getThemePages } from "@/app/actions/theme-pages";
import { getContentFormats } from "@/app/actions/theme-content-formats";
import { 
  IconSparkles, 
  IconPlus, 
  IconCards, 
  IconPlayerPlay, 
  IconPlayerPause, 
  IconArrowRight 
} from "@tabler/icons-react";

export default async function ThemeStudioOverviewPage() {
  const [pagesRes, formatsRes] = await Promise.all([
    getThemePages(),
    getContentFormats(),
  ]);

  const pages = pagesRes.pages || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <IconSparkles className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Theme Studio</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Build, operate, and automate niche social media pages with factual provenance and branded templates.
          </p>
        </div>

        <Link
          href="/theme-studio/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-all shadow-sm self-start"
        >
          <IconPlus className="w-4 h-4" /> Create Theme Page
        </Link>
      </div>

      {pages.length === 0 ? (
        <div className="p-16 text-center border-2 border-dashed rounded-3xl bg-card/40 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
            <IconSparkles className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">No Theme Pages Created Yet</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Theme Studio turns raw news and stories into structured daily cards, carousels, and vertical videos with automatic fact attribution and proof-of-rights.
          </p>
          <Link
            href="/theme-studio/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 shadow-md"
          >
            <IconPlus className="w-4 h-4" /> Start Theme Page Setup Wizard
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pages.map((page) => (
            <Link
              key={page.id}
              href={`/theme-studio/${page.id}`}
              className="p-6 border rounded-2xl bg-card hover:border-primary/40 hover:shadow-lg transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      page.status === "active"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : page.status === "paused"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {page.status}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    Rev #{page.recipeRevision}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                    {page.name}
                  </h3>
                  {page.niche && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {page.niche}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t mt-6 flex items-center justify-between text-xs text-muted-foreground">
                <span>Rights: {page.defaultRightsPolicy}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
                  Open Studio <IconArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
