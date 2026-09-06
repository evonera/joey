"use client";

import * as React from "react";
import Image from "next/image";
import {
  Search01Icon as SearchIcon,
  PlusSignIcon as PlusIcon,
  FilterIcon,
  PinIcon,
  Delete02Icon as TrashIcon,
  Edit02Icon as EditIcon,
  Tick02Icon as CheckIcon,
  Cancel01Icon as CloseIcon,
  SparklesIcon,
  ArrowLeft01Icon as ArrowLeft,
  Clock01Icon as ClockIcon,
  Message01Icon as MessageIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getStoredSessions,
  deleteStoredSession,
  togglePinStoredSession,
  updateStoredSessionTitle,
  type SavedChatSession,
} from "@/lib/chat-sessions";
import { cn } from "@/lib/utils";

interface ChatLibraryViewProps {
  onSelectThread: (session: SavedChatSession) => void;
  onNewThread: (initialPrompt?: string) => void;
  onBackToChat?: () => void;
  className?: string;
}

function extractSnippet(session: SavedChatSession): string {
  // Find the assistant response or user message content
  for (const m of session.messages) {
    let text = "";
    if (typeof m.content === "string") text = m.content;
    else if (Array.isArray(m.parts)) {
      text = m.parts
        .map((p: any) => (p.type === "text" ? p.text : ""))
        .filter(Boolean)
        .join(" ");
    }
    const clean = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[#*`_]/g, "")
      .trim();
    if (clean.length > 20) {
      return clean.slice(0, 160) + (clean.length > 160 ? "…" : "");
    }
  }
  return "Empty conversation thread.";
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

const STARTER_PROMPTS = [
  {
    icon: "🐱",
    title: "Draft a viral breakdown thread",
    desc: "Hook-driven structure optimized for bookmark & share velocity on X & LinkedIn",
    prompt: "Draft a high-velocity breakdown thread about building autonomous AI content pipelines with proven hooks.",
  },
  {
    icon: "⚡",
    title: "Build an automated theme flow",
    desc: "Connect RSS sources, daily mix slots, and multi-channel scheduling on autopilot",
    prompt: "Show me how to configure an automated Theme Studio flow that ingests RSS feeds and publishes 2 daily insights.",
  },
  {
    icon: "🎯",
    title: "Critique hooks & retention angles",
    desc: "A/B test 5 contrarian openers before spending effort on post body copy",
    prompt: "Generate 5 contrarian hooks for a launch announcement and critique why each works or fails.",
  },
];

export function ChatLibraryView({
  onSelectThread,
  onNewThread,
  onBackToChat,
  className,
}: ChatLibraryViewProps) {
  const [sessions, setSessions] = React.useState<SavedChatSession[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSelectMode, setIsSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = React.useState("");
  const [filterModel, setFilterModel] = React.useState<string | null>(null);

  const refreshSessions = React.useCallback(() => {
    setSessions(getStoredSessions());
  }, []);

  React.useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const uniqueModels = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.model) set.add(s.model);
    }
    return Array.from(set);
  }, [sessions]);

  const filteredSessions = React.useMemo(() => {
    return sessions.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.model && s.model.toLowerCase().includes(q)) ||
        extractSnippet(s).toLowerCase().includes(q);

      const matchesModel = !filterModel || s.model === filterModel;
      return matchesQuery && matchesModel;
    });
  }, [sessions, searchQuery, filterModel]);

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      deleteStoredSession(id);
    }
    setSelectedIds(new Set());
    setIsSelectMode(false);
    refreshSessions();
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    togglePinStoredSession(id);
    refreshSessions();
  };

  const handleDeleteOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteStoredSession(id);
    refreshSessions();
  };

  const startRename = (s: SavedChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditTitleValue(s.title);
  };

  const saveRename = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editTitleValue.trim()) {
      updateStoredSessionTitle(id, editTitleValue.trim());
      refreshSessions();
    }
    setEditingId(null);
  };

  return (
    <div
      className={cn(
        "flex flex-col min-h-full w-full max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10 bg-background text-foreground animate-in fade-in duration-150",
        className
      )}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {onBackToChat && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBackToChat}
              className="h-8 px-2.5 rounded-lg border-border/60 hover:border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 gap-1.5 text-xs font-medium cursor-pointer shadow-none"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back to Chat</span>
            </Button>
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Thread Library</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#ffe633]/15 text-[#ffe633] border border-[#ffe633]/30 font-medium">
                {sessions.length}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Revisit and manage your autonomous co-pilot sessions with Joey
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => onNewThread()}
          className="rounded-full bg-[#ffe633] text-black hover:bg-[#ffe633]/90 font-medium px-4 py-2 text-xs sm:text-sm gap-1.5 shadow-xs cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <PlusIcon className="size-4 stroke-[2.5]" />
          <span>New thread</span>
        </Button>
      </div>

      {/* Search Input & Model Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <div className="flex items-center rounded-xl border border-white/[0.08] bg-muted/20 px-3.5 py-2.5 shadow-xs focus-within:border-[#ffe633]/50 focus-within:ring-1 focus-within:ring-[#ffe633]/30 transition-all">
            <SearchIcon className="size-4 text-muted-foreground mr-2.5 shrink-0" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversation topics, hooks, or models..."
              className="h-7 border-0 bg-transparent p-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/60 shadow-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <CloseIcon className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Model Filter Pills if sessions have varied models */}
        {uniqueModels.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1">
            <span className="text-muted-foreground/70 text-[11px] mr-1">Filter:</span>
            <button
              type="button"
              onClick={() => setFilterModel(null)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                filterModel === null
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
              )}
            >
              All models
            </button>
            {uniqueModels.map((model) => (
              <button
                key={model}
                type="button"
                onClick={() => setFilterModel(filterModel === model ? null : model)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer truncate max-w-[160px]",
                  filterModel === model
                    ? "bg-[#ffe633]/20 text-[#ffe633] border border-[#ffe633]/40"
                    : "bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                )}
              >
                {model.split("/").pop() || model}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Subtitle & Selection Controls */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 px-1">
        <span>
          Showing {filteredSessions.length} of {sessions.length} saved threads
        </span>
        <div className="flex items-center gap-3">
          {isSelectMode ? (
            <>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="text-red-400 hover:text-red-300 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <TrashIcon className="size-3.5" />
                  Delete ({selectedIds.size})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsSelectMode(false);
                  setSelectedIds(new Set());
                }}
                className="hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : (
            sessions.length > 0 && (
              <button
                type="button"
                onClick={() => setIsSelectMode(true)}
                className="hover:text-foreground transition-colors font-medium cursor-pointer"
              >
                Select
              </button>
            )
          )}
        </div>
      </div>

      {/* Thread List or Rich Empty State */}
      <div className="divide-y divide-border/20 border-t border-border/20">
        {filteredSessions.length === 0 ? (
          sessions.length === 0 ? (
            /* First time empty state with Joey Cat mascot & starter prompts */
            <div className="py-14 sm:py-20 text-center flex flex-col items-center">
              <div className="relative mb-5">
                <Image
                  src="/joey-mascot.png"
                  alt="Joey the Cat Mascot"
                  width={64}
                  height={64}
                  className="mx-auto drop-shadow-[0_4px_24px_rgba(255,230,51,0.4)] animate-in zoom-in-95 duration-200"
                />
              </div>
              <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">
                Your Joey Thread Library is Empty
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mt-1.5 mb-8 leading-relaxed">
                Joey automatically stores your research threads, viral hooks, and flow designs here so you can pick up where you left off.
              </p>

              {/* Starter Prompt Cards */}
              <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-3 gap-3 text-left mb-8">
                {STARTER_PROMPTS.map((starter) => (
                  <button
                    key={starter.title}
                    type="button"
                    onClick={() => onNewThread(starter.prompt)}
                    className="p-3.5 rounded-xl border border-white/[0.08] bg-muted/20 hover:bg-muted/40 hover:border-[#ffe633]/40 transition-all flex flex-col justify-between group cursor-pointer text-left"
                  >
                    <div>
                      <span className="text-lg block mb-2">{starter.icon}</span>
                      <h3 className="text-xs font-semibold text-foreground group-hover:text-[#ffe633] transition-colors leading-snug">
                        {starter.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2 leading-relaxed">
                        {starter.desc}
                      </p>
                    </div>
                    <span className="text-[10px] text-primary/70 font-medium mt-3 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                      Start thread →
                    </span>
                  </button>
                ))}
              </div>

              <Button
                type="button"
                onClick={() => onNewThread()}
                className="rounded-full bg-[#ffe633] text-black hover:bg-[#ffe633]/90 font-semibold px-5 py-2.5 text-xs sm:text-sm gap-2 shadow-sm cursor-pointer"
              >
                <PlusIcon className="size-4 stroke-[2.5]" />
                <span>Start your first thread with Joey</span>
              </Button>
            </div>
          ) : (
            /* Search yielded no results */
            <div className="py-16 text-center text-muted-foreground">
              <SparklesIcon className="size-8 mx-auto mb-3 opacity-30 text-primary" />
              <p className="text-sm font-medium text-foreground">No matching threads found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                No conversations matched &ldquo;{searchQuery}&rdquo;. Try another term or clear your filter.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterModel(null);
                }}
                className="mt-4 text-xs h-8 cursor-pointer"
              >
                Clear filters
              </Button>
            </div>
          )
        ) : (
          filteredSessions.map((session) => {
            const isSelected = selectedIds.has(session.id);
            const isEditing = editingId === session.id;
            const snippet = extractSnippet(session);
            const timeAgo = formatRelativeTime(session.updatedAt);

            return (
              <div
                key={session.id}
                onClick={() => {
                  if (isSelectMode) {
                    handleToggleSelect(session.id, { stopPropagation: () => {} } as any);
                  } else {
                    onSelectThread(session);
                  }
                }}
                className={cn(
                  "group relative flex items-start justify-between py-4 px-3 hover:bg-muted/20 rounded-xl cursor-pointer transition-all my-1",
                  isSelected && "bg-primary/10 hover:bg-primary/15 border border-primary/30",
                  session.isPinned && "border-l-2 border-[#ffe633] pl-3.5 bg-muted/10"
                )}
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1 pr-4">
                  {/* Select Checkbox */}
                  {isSelectMode && (
                    <button
                      type="button"
                      onClick={(e) => handleToggleSelect(session.id, e)}
                      className={cn(
                        "mt-1 size-4 rounded border border-border/80 flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "hover:border-primary/60"
                      )}
                    >
                      {isSelected && <CheckIcon className="size-3 stroke-[3]" />}
                    </button>
                  )}

                  <div className="space-y-1.5 min-w-0 flex-1">
                    {/* Thread Title */}
                    {isEditing ? (
                      <form
                        onSubmit={(e) => saveRename(session.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2"
                      >
                        <Input
                          autoFocus
                          value={editTitleValue}
                          onChange={(e) => setEditTitleValue(e.target.value)}
                          className="h-7 text-sm py-0 px-2"
                        />
                        <button
                          type="submit"
                          className="text-xs text-primary font-medium hover:underline shrink-0 cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs text-muted-foreground hover:underline shrink-0 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm sm:text-base font-semibold text-foreground tracking-tight truncate max-w-md group-hover:text-primary transition-colors">
                          {session.title}
                        </h2>
                        {session.isPinned && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#ffe633]/15 text-[#ffe633] border border-[#ffe633]/30">
                            <PinIcon className="size-2.5 rotate-45" />
                            <span>Pinned</span>
                          </span>
                        )}
                        {session.model && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border/40 font-mono">
                            {session.model.split("/").pop()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Preview Snippet */}
                    <p className="text-xs sm:text-sm text-muted-foreground/85 line-clamp-1 leading-normal">
                      {snippet}
                    </p>

                    {/* Meta info footer */}
                    <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground/60 pt-0.5 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="size-3 opacity-70" />
                        <span>{timeAgo}</span>
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <MessageIcon className="size-3 opacity-70" />
                        <span>{session.messageCount} messages</span>
                      </span>
                      {session.tokenMetrics.totalTokens > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-[10px] bg-muted/40 px-1 py-0.2 rounded">
                            {(session.tokenMetrics.totalTokens / 1000).toFixed(1)}k tokens
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Hover Actions (Pin, Rename, Delete) */}
                {!isSelectMode && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleTogglePin(session.id, e)}
                      className={cn(
                        "size-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer",
                        session.isPinned && "text-[#ffe633] hover:text-[#ffe633]"
                      )}
                      title={session.isPinned ? "Unpin thread" : "Pin thread"}
                    >
                      <PinIcon className="size-3.5 rotate-45" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => startRename(session, e)}
                      className="size-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Rename thread"
                    >
                      <EditIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteOne(session.id, e)}
                      className="size-7 p-0 text-muted-foreground hover:text-red-400 cursor-pointer"
                      title="Delete thread"
                    >
                      <TrashIcon className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

