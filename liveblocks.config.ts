declare global {
  interface Liveblocks {
    // Each user's Presence, for useMyPresence, useOthers, etc.
    Presence: {
      cursor?: { x: number; y: number } | null;
      isReviewing?: boolean;
      activeDraftId?: string | null;
    };

    // The Storage tree for the room, for useMutation, useStorage, etc.
    Storage: Record<string, never>;

    UserMeta: {
      id: string;
      info: {
        name: string;
        avatar?: string;
        role?: string;
        email?: string;
      };
    };

    // Custom events, for useBroadcastEvent, useEventListener
    RoomEvent:
      | { type: "DRAFT_APPROVED"; draftId: string; variantName?: string; approvedBy: string }
      | { type: "DRAFT_REJECTED"; draftId: string; rejectedBy: string; feedback?: string }
      | { type: "DRAFT_UPDATED"; draftId: string; updatedBy: string };

    // Custom metadata set on threads, for useThreads, useCreateThread, etc.
    ThreadMetadata: {
      draftId?: string;
      status?: "open" | "resolved";
    };

    // Custom room info set with resolveRoomsInfo, for useRoomInfo
    RoomInfo: {
      title?: string;
      url?: string;
    };

    // Custom group info set with resolveGroupsInfo, for useGroupInfo
    GroupInfo: Record<string, never>;

    // Custom activities data for custom notification kinds
    ActivitiesData: Record<string, never>;
  }
}

export {};
