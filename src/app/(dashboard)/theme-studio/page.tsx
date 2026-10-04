import * as React from "react";
import Link from "next/link";
import { getThemePages } from "@/app/actions/theme-pages";
import { getCreationShelf } from "@/app/actions/creation-shelf";
import { 
  IconSparkles, 
  IconPlus, 
  IconCards, 
  IconPlayerPlay, 
  IconPlayerPause, 
  IconArrowRight 
} from "@tabler/icons-react";

export default async function ThemeStudioOverviewPage() {
  const [pagesRes, shelf] = await Promise.all([getThemePages(), getCreationShelf('theme')]);

  if (pagesRes.error) throw new Error(pagesRes.error);
  const pages = pagesRes.pages || [];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6" data-tour="theme-studio-overview">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <IconSparkles className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Theme Studio</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Create a post or brand an MP4 now. Set up a Theme Page when you want a repeatable series.
          </p>
        </div>

        <Link
          href="/theme-studio/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-border font-semibold text-sm rounded-xl hover:bg-muted transition-all self-start"
        >
          <IconPlus className="w-4 h-4" /> Create Theme Page
        </Link>
      </div>

      <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-8">
        <h2 className="text-xl font-semibold">Make something now</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">Start in Chat, preview your work, and save a draft before connecting a publishing account.</p>
        <div className="mt-4 flex flex-wrap gap-2"><Link href="/dashboard?create=post" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Create a post</Link><Link href="/dashboard?create=video" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Brand an MP4</Link></div>
      </section>

      {(shelf.posts.length > 0 || shelf.templates.length > 0) && <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Your recent work</h2><Link href="/theme-studio/templates" className="text-sm font-medium text-primary hover:underline">All templates</Link></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shelf.posts.slice(0, 4).map((post) => <Link key={post.id} href={`/drafts?tab=all&source=theme_studio&search=${encodeURIComponent(post.title)}`} className="min-w-0 rounded-xl border border-border bg-card p-3 hover:border-primary/40"><span className="text-[11px] uppercase text-muted-foreground">Post · {post.status.replace('_', ' ')}</span>{post.mediaUrls[0] && <img src={post.mediaUrls[0]} alt={`Preview of ${post.title}`} className="mt-2 h-28 w-full rounded-md object-contain" />}<span className="mt-2 block truncate text-sm font-medium">{post.title}</span></Link>)}
          {shelf.templates.slice(0, 4).map((template) => <Link key={template.id} href={template.themePageId ? `/theme-studio/${template.themePageId}/templates/${template.id}` : `/theme-studio/templates/${template.id}`} className="min-w-0 rounded-xl border border-border bg-card p-3 hover:border-primary/40"><span className="text-[11px] uppercase text-muted-foreground">Template · {template.formatName}</span>{template.previewUrl ? <img src={template.previewUrl} alt={`Preview of ${template.name}`} className="mt-2 h-28 w-full rounded-md object-contain" /> : <div className="mt-2 flex h-28 items-center justify-center rounded-md bg-gradient-to-br from-slate-900 to-slate-700 p-3 text-center text-xs font-semibold text-white">{template.formatName}</div>}<span className="mt-2 block truncate text-sm font-medium" title={template.name}>{template.name.replace(/\s*\([0-9a-f-]{36}\)$/, "")}</span></Link>)}
        </div>
      </section>}

      {pages.length === 0 ? (
        <div className="px-6 py-12 sm:p-16 text-center border-2 border-dashed rounded-3xl bg-card/40 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
            <IconSparkles className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">Build a repeatable series</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            When you are ready to automate, choose a topic and sources, then review posts before publishing.
          </p>
          <Link
            href="/theme-studio/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 shadow-md"
          >
            <IconPlus className="w-4 h-4" /> Create your first theme page
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
