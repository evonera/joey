"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Globe,
  Sparkles,
  BarChart3,
  BookmarkCheck,
  Binoculars,
  Zap,
  ChevronDown,
} from "lucide-react";
import {
  IconBrandTwitter,
  IconBrandInstagram,
  IconBrandLinkedin,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface ChatSource {
  id: string;
  tag: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface ChatSkill {
  id: string;
  slash: string;
  name: string;
  description: string;
  promptTemplate: string;
}

export const WORKSPACE_SOURCES: ChatSource[] = [
  {
    id: "brandkit",
    tag: "@brandkit",
    name: "Brand Kit",
    description: "Brand persona, voice, tone, and banned terms",
    icon: BookmarkCheck,
  },
  {
    id: "scouts",
    tag: "@scouts",
    name: "Social Scouts",
    description: "Latest competitor spikes and viral format alerts",
    icon: Binoculars,
  },
  {
    id: "analytics",
    tag: "@analytics",
    name: "Analytics",
    description: "7-day post performance & engagement metrics",
    icon: BarChart3,
  },
  {
    id: "twitter",
    tag: "@twitter",
    name: "Twitter / X",
    description: "Connected X accounts and tweet history",
    icon: IconBrandTwitter as any,
  },
  {
    id: "instagram",
    tag: "@instagram",
    name: "Instagram",
    description: "Connected Instagram theme page & reels",
    icon: IconBrandInstagram as any,
  },
  {
    id: "linkedin",
    tag: "@linkedin",
    name: "LinkedIn",
    description: "Connected LinkedIn account and posts",
    icon: IconBrandLinkedin as any,
  },
];

export const WORKSPACE_SKILLS: ChatSkill[] = [
  {
    id: "viral-hooks",
    slash: "/viral-hooks",
    name: "Viral Hooks",
    description: "5 high-retention short-form video hooks & visual cues",
    promptTemplate: "Use the viral-hooks skill to generate 5 high-converting video hooks for: ",
  },
  {
    id: "carousel-storyboard",
    slash: "/carousel-storyboard",
    name: "Carousel Storyboard",
    description: "5-8 slide Instagram/LinkedIn retention carousel",
    promptTemplate: "Use the carousel-storyboard skill to outline a multi-slide carousel on: ",
  },
  {
    id: "theme-remix",
    slash: "/theme-remix",
    name: "Theme Remix",
    description: "Remix competitor spikes into original on-brand theme posts",
    promptTemplate: "Use the theme-remix skill to adapt this competitor reference into an original post: ",
  },
  {
    id: "trend-hijack",
    slash: "/trend-hijack",
    name: "Trend Hijack",
    description: "Rapid cultural meme & breaking news brand reaction",
    promptTemplate: "Use the trend-hijack skill to write a timely brand commentary on: ",
  },
  {
    id: "curate-content",
    slash: "/curate-content",
    name: "Curate Content",
    description: "Research industry trends and draft timely posts",
    promptTemplate: "Use the curate-content skill to research current developments and draft a post on: ",
  },
];

/**
 * Scira 2-Style Sources Pill Button
 */
export function SourcesPillButton({
  activeSourceIds,
  onToggleSource,
}: {
  activeSourceIds: string[];
  onToggleSource: (id: string) => void;
}) {
  const activeSources = WORKSPACE_SOURCES.filter((s) => activeSourceIds.includes(s.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-7 px-2 flex items-center gap-1.5 rounded-full text-xs font-medium transition-colors border",
            activeSources.length > 0
              ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20"
              : "bg-muted/40 border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
          title="Toggle active workspace sources"
        >
          {activeSources.length > 0 ? (
            <div className="flex items-center gap-1">
              {activeSources.slice(0, 3).map((s) => {
                const Icon = s.icon;
                return <Icon key={s.id} className="size-3" />;
              })}
              {activeSources.length > 3 && (
                <span className="text-[10px] font-mono">+{activeSources.length - 3}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Globe className="size-3" />
              <span className="text-[11px]">Sources</span>
            </div>
          )}
          <ChevronDown className="size-2.5 opacity-60 ml-0.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-1.5 text-xs">
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Workspace Sources
        </DropdownMenuLabel>
        {WORKSPACE_SOURCES.map((source) => {
          const Icon = source.icon;
          const isChecked = activeSourceIds.includes(source.id);
          return (
            <DropdownMenuCheckboxItem
              key={source.id}
              checked={isChecked}
              onCheckedChange={() => onToggleSource(source.id)}
              className="gap-2 py-1.5 cursor-pointer text-xs"
            >
              <Icon className="size-3.5 text-muted-foreground shrink-0" />
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{source.name}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {source.tag}
                </span>
              </div>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 3x3 Animated Dot Matrix Loader (Scira 2 Signature)
 */
export function DotMatrixLoader({ isLive }: { isLive: boolean }) {
  if (!isLive) return null;
  return (
    <div
      className="grid grid-cols-3 gap-[2px] size-3.5 items-center justify-center"
      title="Joey Agent is streaming..."
    >
      {[...Array(9)].map((_, i) => (
        <span
          key={i}
          className="size-[2.5px] rounded-full bg-amber-400 animate-pulse"
          style={{
            animationDelay: `${((i % 3) + Math.floor(i / 3)) * 120}ms`,
            animationDuration: "1000ms",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Caret Popup for @ Sources and / Skills
 */
export function ComposerAutocompleteMenu({
  type,
  query,
  onSelectSource,
  onSelectSkill,
}: {
  type: "sources" | "skills" | null;
  query: string;
  onSelectSource: (source: ChatSource) => void;
  onSelectSkill: (skill: ChatSkill) => void;
}) {
  if (!type) return null;

  const normalizedQuery = query.toLowerCase().trim();

  if (type === "sources") {
    const filtered = WORKSPACE_SOURCES.filter(
      (s) =>
        s.name.toLowerCase().includes(normalizedQuery) ||
        s.tag.toLowerCase().includes(normalizedQuery)
    );

    return (
      <div className="absolute bottom-full left-3 mb-2 w-72 rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-xl backdrop-blur-md z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Sources ({filtered.length})
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">No matching sources</div>
          ) : (
            filtered.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSource(s)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-muted/70 transition-colors group"
                >
                  <div className="size-6 rounded-md bg-muted flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-foreground">
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground">{s.name}</span>
                      <span className="text-[10px] font-mono text-amber-500">{s.tag}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{s.description}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (type === "skills") {
    const filtered = WORKSPACE_SKILLS.filter(
      (s) =>
        s.name.toLowerCase().includes(normalizedQuery) ||
        s.slash.toLowerCase().includes(normalizedQuery)
    );

    return (
      <div className="absolute bottom-full left-3 mb-2 w-80 rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-xl backdrop-blur-md z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Eve Skills ({filtered.length})
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">No matching skills</div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSkill(s)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-muted/70 transition-colors group"
              >
                <div className="size-6 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-500">
                  <Zap className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">{s.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{s.slash}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{s.description}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return null;
}
