"use client";

import * as React from "react";
import {
  Search01Icon as SearchIcon,
  PlusSignIcon as PlusIcon,
  Delete02Icon as TrashIcon,
  Edit02Icon as EditIcon,
  PinIcon,
  Clock01Icon as HistoryIcon,
  Tick02Icon as CheckIcon,
  Cancel01Icon as CloseIcon,
  Message01Icon as MessageIcon,
} from "hugeicons-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getStoredSessions,
  deleteStoredSession,
  togglePinStoredSession,
  updateStoredSessionTitle,
  groupSessionsByDate,
  type SavedChatSession,
} from "@/lib/chat-sessions";
import { getModelById } from "@/lib/models";

interface ChatHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSessionId?: string;
  onSelectSession: (session: SavedChatSession) => void;
  onNewChat: () => void;
}

export function ChatHistoryDrawer({
  open,
  onOpenChange,
  activeSessionId,
  onSelectSession,
  onNewChat,
}: ChatHistoryDrawerProps) {
  const [sessions, setSessions] = React.useState<SavedChatSession[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");

  const refreshSessions = React.useCallback(() => {
    setSessions(getStoredSessions());
  }, []);

  React.useEffect(() => {
    if (open) {
      refreshSessions();
    }
  }, [open, refreshSessions]);

  // Global hotkey: Cmd/Ctrl + H to toggle history
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const filteredSessions = React.useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  const pinnedSessions = React.useMemo(
    () => filteredSessions.filter((s) => s.isPinned),
    [filteredSessions]
  );
  const unpinnedSessions = React.useMemo(
    () => filteredSessions.filter((s) => !s.isPinned),
    [filteredSessions]
  );
  const grouped = React.useMemo(
    () => groupSessionsByDate(unpinnedSessions),
    [unpinnedSessions]
  );

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteStoredSession(id);
    refreshSessions();
    if (activeSessionId === id) {
      onNewChat();
    }
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    togglePinStoredSession(id);
    refreshSessions();
  };

  const handleStartRename = (s: SavedChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditTitle(s.title);
  };

  const handleSaveRename = (id: string, e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editTitle.trim()) {
      updateStoredSessionTitle(id, editTitle);
      refreshSessions();
    }
    setEditingId(null);
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const renderSessionItem = (session: SavedChatSession) => {
    const isActive = session.id === activeSessionId;
    const isEditing = editingId === session.id;
    const model = getModelById(session.model);

    return (
      <div
        key={session.id}
        onClick={() => {
          if (!isEditing) {
            onSelectSession(session);
            onOpenChange(false);
          }
        }}
        className={cn(
          "group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer select-none",
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MessageIcon className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
          {isEditing ? (
            <form
              onSubmit={(e) => handleSaveRename(session.id, e)}
              className="flex items-center gap-1 flex-1 min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoFocus
                className="h-6 w-full rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="submit"
                className="size-5 rounded hover:bg-muted flex items-center justify-center text-emerald-500"
              >
                <CheckIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={handleCancelRename}
                className="size-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                <CloseIcon className="size-3" />
              </button>
            </form>
          ) : (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate text-foreground text-xs leading-tight">
                {session.title}
              </span>
              <span className="text-[10px] text-muted-foreground truncate mt-0.5">
                {model.name} · {session.messageCount} msg
                {session.estimatedCostUsd > 0
                  ? ` · $${session.estimatedCostUsd.toFixed(4)}`
                  : ""}
              </span>
            </div>
          )}
        </div>

        {!isEditing ? (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => handleTogglePin(session.id, e)}
              className={cn(
                "size-6 rounded flex items-center justify-center hover:bg-background/80 transition-colors",
                session.isPinned
                  ? "text-primary opacity-100"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={session.isPinned ? "Unpin chat" : "Pin chat"}
            >
              <PinIcon className="size-3" />
            </button>
            <button
              type="button"
              onClick={(e) => handleStartRename(session, e)}
              className="size-6 rounded flex items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground transition-colors"
              title="Rename chat"
            >
              <EditIcon className="size-3" />
            </button>
            <button
              type="button"
              onClick={(e) => handleDelete(session.id, e)}
              className="size-6 rounded flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Delete chat"
            >
              <TrashIcon className="size-3" />
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 sm:w-96 p-0 flex flex-col gap-0 border-r border-border/60">
        <SheetHeader className="p-4 border-b border-border/40 space-y-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-semibold flex items-center gap-2">
              <HistoryIcon className="size-4 text-primary" />
              <span>Recent Chats</span>
            </SheetTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onNewChat();
                onOpenChange(false);
              }}
              className="h-7 text-xs gap-1.5"
            >
              <PlusIcon className="size-3.5" />
              <span>New Chat</span>
            </Button>
          </div>

          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations…"
              className="h-8 pl-8 text-xs bg-muted/20 border-border/50"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <MessageIcon className="size-8 stroke-1 opacity-40 mb-2" />
              <p className="text-xs font-medium text-foreground">No recent conversations</p>
              <p className="text-[11px] mt-1 max-w-[200px]">
                Your completed chat sessions will appear here automatically.
              </p>
            </div>
          ) : (
            <>
              {pinnedSessions.length > 0 ? (
                <div className="space-y-1">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <PinIcon className="size-3" />
                    <span>Pinned</span>
                  </div>
                  {pinnedSessions.map(renderSessionItem)}
                </div>
              ) : null}

              {grouped.today.length > 0 ? (
                <div className="space-y-1">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Today
                  </div>
                  {grouped.today.map(renderSessionItem)}
                </div>
              ) : null}

              {grouped.yesterday.length > 0 ? (
                <div className="space-y-1">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Yesterday
                  </div>
                  {grouped.yesterday.map(renderSessionItem)}
                </div>
              ) : null}

              {grouped.thisWeek.length > 0 ? (
                <div className="space-y-1">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Previous 7 Days
                  </div>
                  {grouped.thisWeek.map(renderSessionItem)}
                </div>
              ) : null}

              {grouped.older.length > 0 ? (
                <div className="space-y-1">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Older
                  </div>
                  {grouped.older.map(renderSessionItem)}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="p-3 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>
            {sessions.length} saved thread{sessions.length === 1 ? "" : "s"}
          </span>
          <span className="font-mono text-[10px] opacity-70">Cmd+H to toggle</span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
