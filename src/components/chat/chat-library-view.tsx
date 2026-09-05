"use client";

import * as React from "react";
import {
  Search01Icon as SearchIcon,
  PlusSignIcon as PlusIcon,
  FilterIcon,
  PinIcon,
  Delete02Icon as TrashIcon,
  Edit02Icon as EditIcon,
  CheckmarkCircle02Icon as CheckCircle,
  Tick02Icon as CheckIcon,
  Cancel01Icon as CloseIcon,
  SparklesIcon,
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
  onNewThread: () => void;
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
    if (diffMins < 60) return `about ${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
    if (diffHours < 24) return `about ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

export function ChatLibraryView({
  onSelectThread,
  onNewThread,
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

  const filteredSessions = React.useMemo(() => {
    return sessions.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
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
        "flex flex-col min-h-full w-full max-w-4xl mx-auto px-4 sm:px-8 py-8 sm:py-12 bg-background text-foreground animate-in fade-in duration-150",
        className
      )}
    >
      {/* Top Header matching Scira screenshot */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          Library
        </h1>
        <Button
          type="button"
          onClick={onNewThread}
          className="rounded-full bg-[#ffe633] text-black hover:bg-[#ffe633]/90 font-medium px-4 py-2 text-xs sm:text-sm gap-1.5 shadow-sm"
        >
          <PlusIcon className="size-4 stroke-[2.5]" />
          <span>New thread</span>
        </Button>
      </div>

      {/* Search Input matching Scira screenshot */}
      <div className="relative mb-6">
        <div className="flex items-center rounded-xl border border-white/[0.08] bg-muted/20 px-3.5 py-2.5 shadow-xs focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/40 transition-all">
          <SearchIcon className="size-4 text-muted-foreground mr-2.5 shrink-0" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your threads..."
            className="h-7 border-0 bg-transparent p-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/60 shadow-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <CloseIcon className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
              title="Filter"
            >
              <FilterIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Subtitle & Selection Controls */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-4 px-1">
        <span>
          Your threads with Joey · {filteredSessions.length}
        </span>
        <div className="flex items-center gap-3">
          {isSelectMode ? (
            <>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="text-red-400 hover:text-red-300 font-medium flex items-center gap-1 transition-colors"
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
                className="hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsSelectMode(true)}
              className="hover:text-foreground transition-colors font-medium"
            >
              Select
            </button>
          )}
        </div>
      </div>

      {/* Thread List */}
      <div className="divide-y divide-border/20 border-t border-border/20">
        {filteredSessions.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <SparklesIcon className="size-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium text-foreground">No threads found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery
                ? "Try adjusting your search query."
                : "Start a new conversation with Joey to populate your library."}
            </p>
          </div>
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
                  "group relative flex items-start justify-between py-4 px-2 hover:bg-muted/15 rounded-lg cursor-pointer transition-colors",
                  isSelected && "bg-primary/5 hover:bg-primary/10",
                  session.isPinned && "border-l-2 border-primary pl-3"
                )}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1 pr-4">
                  {/* Select Checkbox */}
                  {isSelectMode && (
                    <button
                      type="button"
                      onClick={(e) => handleToggleSelect(session.id, e)}
                      className={cn(
                        "mt-1 size-4 rounded border border-border/80 flex items-center justify-center transition-colors shrink-0",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "hover:border-primary/60"
                      )}
                    >
                      {isSelected && <CheckIcon className="size-3 stroke-[3]" />}
                    </button>
                  )}

                  <div className="space-y-1 min-w-0 flex-1">
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
                          className="text-xs text-primary font-medium hover:underline shrink-0"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs text-muted-foreground hover:underline shrink-0"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm sm:text-base font-semibold text-foreground tracking-tight truncate">
                          {session.title}
                        </h2>
                        {session.isPinned && (
                          <PinIcon className="size-3 text-primary shrink-0 rotate-45" />
                        )}
                      </div>
                    )}

                    {/* Preview Snippet matching Scira screenshot */}
                    <p className="text-xs sm:text-sm text-muted-foreground/80 line-clamp-1 leading-normal">
                      {snippet}
                    </p>

                    {/* Timestamp & Message count meta */}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 pt-0.5">
                      <span>Last message {timeAgo}</span>
                      <span>·</span>
                      <span>
                        {session.messageCount} message{session.messageCount === 1 ? "" : "s"}
                      </span>
                      {session.tokenMetrics.totalTokens > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-mono">
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
                        "size-7 p-0 text-muted-foreground hover:text-foreground",
                        session.isPinned && "text-primary"
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
                      className="size-7 p-0 text-muted-foreground hover:text-foreground"
                      title="Rename thread"
                    >
                      <EditIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteOne(session.id, e)}
                      className="size-7 p-0 text-muted-foreground hover:text-red-400"
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
