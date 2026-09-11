"use client";

import { createContext, useContext, ReactNode, useCallback, useMemo } from "react";
import { RoomProvider, useBroadcastEvent, useEventListener, useOthers, useSelf } from "@liveblocks/react";
import { useLiveblocksConfig } from "@/components/collaboration/liveblocks-provider";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users } from "lucide-react";

interface Reviewer {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
}

interface DraftCollaborationContextValue {
  isCollaborative: boolean;
  reviewers: Reviewer[];
  broadcastApproval: (variantName?: string) => void;
  broadcastRejection: (feedback?: string) => void;
  broadcastUpdate: () => void;
}

const DraftCollaborationContext = createContext<DraftCollaborationContextValue>({
  isCollaborative: false,
  reviewers: [],
  broadcastApproval: () => {},
  broadcastRejection: () => {},
  broadcastUpdate: () => {},
});

export function useDraftCollaboration() {
  return useContext(DraftCollaborationContext);
}

interface DraftReviewRoomProps {
  draftId: string;
  children: ReactNode;
  onActionComplete?: () => void;
}

function InnerDraftReviewRoom({
  draftId,
  children,
  onActionComplete,
}: {
  draftId: string;
  children: ReactNode;
  onActionComplete?: () => void;
}) {
  const broadcast = useBroadcastEvent();
  const self = useSelf();
  const others = useOthers();

  const reviewers = useMemo(() => {
    return others.map((other) => ({
      id: String(other.connectionId),
      name: other.info?.name || "Teammate",
      avatar: other.info?.avatar,
      role: other.info?.role,
    }));
  }, [others]);

  // Listen for real-time actions performed by teammates on this draft
  useEventListener(({ event }) => {
    if (event.type === "DRAFT_APPROVED" && event.draftId === draftId) {
      toast.success(`${event.approvedBy} approved this draft in real-time`);
      onActionComplete?.();
    } else if (event.type === "DRAFT_REJECTED" && event.draftId === draftId) {
      toast.info(`${event.rejectedBy} rejected this draft${event.feedback ? `: "${event.feedback}"` : ""}`);
      onActionComplete?.();
    } else if (event.type === "DRAFT_UPDATED" && event.draftId === draftId) {
      toast.info(`${event.updatedBy} updated this draft`);
      onActionComplete?.();
    }
  });

  const broadcastApproval = useCallback(
    (variantName?: string) => {
      const userName = self?.info?.name || "A teammate";
      broadcast({
        type: "DRAFT_APPROVED",
        draftId,
        variantName,
        approvedBy: userName,
      });
    },
    [broadcast, draftId, self]
  );

  const broadcastRejection = useCallback(
    (feedback?: string) => {
      const userName = self?.info?.name || "A teammate";
      broadcast({
        type: "DRAFT_REJECTED",
        draftId,
        rejectedBy: userName,
        feedback,
      });
    },
    [broadcast, draftId, self]
  );

  const broadcastUpdate = useCallback(() => {
    const userName = self?.info?.name || "A teammate";
    broadcast({
      type: "DRAFT_UPDATED",
      draftId,
      updatedBy: userName,
    });
  }, [broadcast, draftId, self]);

  const value = useMemo(
    () => ({
      isCollaborative: true,
      reviewers,
      broadcastApproval,
      broadcastRejection,
      broadcastUpdate,
    }),
    [reviewers, broadcastApproval, broadcastRejection, broadcastUpdate]
  );

  return (
    <DraftCollaborationContext.Provider value={value}>
      {/* Live Co-Presence Alert if teammates are currently viewing this draft */}
      {reviewers.length > 0 && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
            <span>
              <strong>{reviewers.map((r) => r.name).join(", ")}</strong>{" "}
              {reviewers.length === 1 ? "is" : "are"} also reviewing this draft
            </span>
          </div>
          <div className="flex -space-x-1.5 overflow-hidden">
            {reviewers.slice(0, 3).map((r, i) => (
              <Avatar key={i} className="h-5 w-5 border border-background">
                {r.avatar && <AvatarImage src={r.avatar} alt={r.name} />}
                <AvatarFallback className="text-[9px] bg-amber-900 text-amber-100">
                  {r.name[0]}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        </div>
      )}
      {children}
    </DraftCollaborationContext.Provider>
  );
}

export function DraftReviewRoom({
  draftId,
  children,
  onActionComplete,
}: DraftReviewRoomProps) {
  const { isConfigured, tenantId } = useLiveblocksConfig();

  // If Liveblocks is not configured or no tenant exists, render gracefully
  if (!isConfigured || !tenantId) {
    return <>{children}</>;
  }

  const roomId = `workspace:${tenantId}:draft:${draftId}`;

  return (
    <RoomProvider
      id={roomId}
      initialPresence={{
        isReviewing: true,
        activeDraftId: draftId,
        cursor: null,
      }}
    >
      <InnerDraftReviewRoom draftId={draftId} onActionComplete={onActionComplete}>
        {children}
      </InnerDraftReviewRoom>
    </RoomProvider>
  );
}
