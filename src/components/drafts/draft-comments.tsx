"use client";

import { useMemo } from "react";
import { useThreads, useIsInsideRoom } from "@liveblocks/react";
import { Thread, Composer } from "@liveblocks/react-ui";
import { useLiveblocksConfig } from "@/components/collaboration/liveblocks-provider";
import { MessageSquare, Loader2, Sparkles } from "lucide-react";

interface DraftCommentsProps {
  draftId: string;
}

function InnerDraftComments({ draftId }: DraftCommentsProps) {
  const { threads, isLoading, error } = useThreads();

  const draftThreads = useMemo(() => {
    if (!threads) return [];
    return threads.filter(
      (t) => !t.metadata?.draftId || t.metadata.draftId === draftId
    );
  }, [threads, draftId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading discussion...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
        Failed to load comments for this draft.
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
          <span>Team Discussion & Revisions ({draftThreads.length})</span>
        </div>
      </div>

      {draftThreads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-center">
          <Sparkles className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            No feedback yet. Tag a teammate with <span className="font-mono text-primary">@name</span> to ask for a review or suggest copy edits.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {draftThreads.map((thread) => (
            <div
              key={thread.id}
              className="rounded-xl border border-border/60 bg-card/60 overflow-hidden shadow-xs"
            >
              <Thread thread={thread} />
            </div>
          ))}
        </div>
      )}

      {/* Composer to create a new thread attached to this draft */}
      <div className="rounded-xl border border-border bg-background/80 overflow-hidden shadow-xs">
        <Composer
          metadata={{ draftId }}
          className="p-1"
        />
      </div>
    </div>
  );
}

export function DraftComments({ draftId }: DraftCommentsProps) {
  const { isConfigured } = useLiveblocksConfig();
  const isInsideRoom = useIsInsideRoom();

  if (!isConfigured) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 text-center text-xs text-muted-foreground">
        Real-time draft comments and co-review are available when Liveblocks is configured.
      </div>
    );
  }

  if (!isInsideRoom) {
    return null;
  }

  return <InnerDraftComments draftId={draftId} />;
}
