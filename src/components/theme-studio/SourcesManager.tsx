"use client";

import * as React from "react";
import { 
  IconPlus, 
  IconTrash, 
  IconRss, 
  IconWorld, 
  IconBrandReddit, 
  IconApi, 
  IconShieldCheck, 
  IconAlertTriangle, 
  IconClock,
  IconLoader2,
  IconCheck,
  IconX
} from "@tabler/icons-react";
import { createThemeSource, deleteThemeSource, toggleThemeSource } from "@/app/actions/theme-sources";
import { toast } from "sonner";

interface SourceItem {
  id: string;
  themePageId: string;
  name: string;
  sourceType: string;
  url: string;
  pollIntervalMinutes: number;
  freshnessWindowHours: number;
  rightsCategory: string;
  isActive: boolean;
  lastPolledAt?: Date | string | null;
}

interface SourcesManagerProps {
  themePageId: string;
  initialSources: SourceItem[];
}

export function SourcesManager({ themePageId, initialSources }: SourcesManagerProps) {
  const [sources, setSources] = React.useState<SourceItem[]>(initialSources);
  const [isAdding, setIsAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [sourceType, setSourceType] = React.useState<"rss" | "http" | "reddit" | "api">("rss");
  const [freshnessHours, setFreshnessHours] = React.useState(24);
  const [rightsCategory, setRightsCategory] = React.useState("cc_by");
  const [loading, setLoading] = React.useState(false);

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    setLoading(true);
    try {
      const res = await createThemeSource({
        themePageId,
        name: name.trim(),
        sourceType,
        url: url.trim(),
        freshnessWindowHours: freshnessHours,
        rightsCategory,
      });

      if (res.error) throw new Error(res.error);
      if (res.source) {
        setSources((prev) => [res.source as SourceItem, ...prev]);
        setIsAdding(false);
        setName("");
        setUrl("");
        toast.success("Source feed added");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to add source");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(sourceId: string) {
    try {
      const res = await toggleThemeSource(sourceId);
      if (res.error) throw new Error(res.error);
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, isActive: !s.isActive } : s))
      );
      toast.success("Source status updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle source");
    }
  }

  async function handleDelete(sourceId: string) {
    try {
      const res = await deleteThemeSource(sourceId);
      if (res.error) throw new Error(res.error);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      toast.success("Source removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete source");
    }
  }

  function renderSourceIcon(type: string) {
    if (type === "reddit") return <IconBrandReddit className="w-4 h-4 text-orange-500" />;
    if (type === "http") return <IconWorld className="w-4 h-4 text-blue-500" />;
    if (type === "api") return <IconApi className="w-4 h-4 text-indigo-500" />;
    return <IconRss className="w-4 h-4 text-amber-500" />;
  }

  function renderRightsBadge(rights: string) {
    const isSafe = ["owned", "public_domain", "cc_by", "cc_by_sa", "commercial_license"].includes(rights);
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
          isSafe
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        }`}
      >
        {isSafe ? <IconShieldCheck className="w-3 h-3" /> : <IconAlertTriangle className="w-3 h-3" />}
        {rights.toUpperCase().replace("_", " ")}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Trusted Sources & Feeds</h2>
          <p className="text-sm text-muted-foreground">
            Joey polls these feeds on schedule, deduplicates items, and clusters news into story angles.
          </p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm self-start"
        >
          <IconPlus className="w-4 h-4" /> Add Source
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddSource} className="p-5 border rounded-xl bg-card/60 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold">Connect New Feed Source</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Source Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ESPN NBA Top News"
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Source Type</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="rss">RSS / Atom XML Feed</option>
                <option value="reddit">Reddit Subreddit (e.g. r/nba)</option>
                <option value="http">HTTP Web / REST Endpoint</option>
                <option value="api">API Ingestion</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Feed URL / Endpoint
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={sourceType === "reddit" ? "https://reddit.com/r/nba or r/nba" : "https://example.com/feed.xml"}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono text-xs"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Freshness Window (Hours)
              </label>
              <input
                type="number"
                min={1}
                max={168}
                value={freshnessHours}
                onChange={(e) => setFreshnessHours(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Rights & Licensing Category
              </label>
              <select
                value={rightsCategory}
                onChange={(e) => setRightsCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="cc_by">Creative Commons Attribution (CC-BY)</option>
                <option value="public_domain">Public Domain / Press Release</option>
                <option value="owned">Owned / Original Material</option>
                <option value="commercial_license">Commercial License</option>
                <option value="unknown">Unknown / Strict Fair Use</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading && <IconLoader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Source
            </button>
          </div>
        </form>
      )}

      {sources.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-xl">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <IconRss className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold">No trusted sources connected</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
            Connect RSS feeds, subreddits, or news APIs to supply content for your daily mix.
          </p>
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg"
          >
            <IconPlus className="w-3.5 h-3.5" /> Add First Source
          </button>
        </div>
      ) : (
        <div className="divide-y border rounded-xl bg-card overflow-hidden shadow-sm">
          {sources.map((source) => (
            <div
              key={source.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2.5 rounded-lg bg-secondary text-secondary-foreground shrink-0 mt-0.5 sm:mt-0">
                  {renderSourceIcon(source.sourceType)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-foreground">{source.name}</h4>
                    {renderRightsBadge(source.rightsCategory)}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate max-w-md mt-0.5">
                    {source.url}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconClock className="w-3.5 h-3.5" />
                  <span>{source.freshnessWindowHours}h window</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(source.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      source.isActive
                        ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {source.isActive ? "Active" : "Paused"}
                  </button>

                  <button
                    onClick={() => handleDelete(source.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    title="Remove source"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
