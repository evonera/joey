"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import {
  LiveblocksProvider,
  useLostConnectionListener,
  useErrorListener,
} from "@liveblocks/react";
import { toast } from "sonner";
import "@liveblocks/react-ui/styles.css";
import "@liveblocks/react-ui/styles/dark/attributes.css";

interface LiveblocksConfigContextValue {
  isConfigured: boolean;
  tenantId?: string | null;
}

const LiveblocksConfigContext = createContext<LiveblocksConfigContextValue>({
  isConfigured: false,
  tenantId: null,
});

export function useLiveblocksConfig() {
  return useContext(LiveblocksConfigContext);
}

function LiveblocksConnectionWatcher() {
  useLostConnectionListener((event) => {
    switch (event) {
      case "lost":
        toast.warning("Real-time sync paused. Reconnecting to workspace...", {
          id: "liveblocks-connection-status",
          duration: 6000,
        });
        break;
      case "restored":
        toast.success("Real-time sync restored", {
          id: "liveblocks-connection-status",
          duration: 3000,
        });
        break;
      case "failed":
        toast.error("Real-time connection failed. Please check your network.", {
          id: "liveblocks-connection-status",
        });
        break;
    }
  });

  useErrorListener((error) => {
    if (error.context.type === "ROOM_CONNECTION_ERROR") {
      const code = error.context.code;
      if (code === 4005) {
        toast.error("Collaborative review room is full.", { id: "liveblocks-error" });
      } else if (code === 4001) {
        toast.error("Permission denied for this workspace room.", { id: "liveblocks-error" });
      }
    }
  });

  return null;
}

interface JoeyLiveblocksProviderProps {
  children: ReactNode;
  isConfigured: boolean;
  tenantId?: string | null;
}

export function JoeyLiveblocksProvider({
  children,
  isConfigured,
  tenantId,
}: JoeyLiveblocksProviderProps) {
  const contextValue = useMemo(
    () => ({
      isConfigured,
      tenantId: tenantId ?? null,
    }),
    [isConfigured, tenantId]
  );

  // If Liveblocks is not configured, render children directly without mounting
  // LiveblocksProvider, completely avoiding unneeded network/websocket attempts.
  if (!isConfigured) {
    return (
      <LiveblocksConfigContext.Provider value={contextValue}>
        {children}
      </LiveblocksConfigContext.Provider>
    );
  }

  return (
    <LiveblocksConfigContext.Provider value={contextValue}>
      <LiveblocksProvider
        authEndpoint="/api/liveblocks-auth"
        backgroundKeepAliveTimeout={15 * 60 * 1000}
        lostConnectionTimeout={5000}
        resolveUsers={async ({ userIds }) => {
          if (!userIds || userIds.length === 0) return [];
          try {
            const res = await fetch("/api/liveblocks-users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userIds }),
            });
            if (!res.ok) {
              return userIds.map(() => undefined);
            }
            return await res.json();
          } catch {
            return userIds.map(() => undefined);
          }
        }}
        resolveMentionSuggestions={async ({ text }) => {
          try {
            const res = await fetch(`/api/liveblocks-users?text=${encodeURIComponent(text || "")}`);
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data.userIds) ? data.userIds : [];
          } catch {
            return [];
          }
        }}
        resolveRoomsInfo={async ({ roomIds }) => {
          if (!roomIds || roomIds.length === 0) return [];
          try {
            const res = await fetch("/api/liveblocks-rooms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ roomIds }),
            });
            if (!res.ok) {
              return roomIds.map(() => undefined);
            }
            return await res.json();
          } catch {
            return roomIds.map(() => undefined);
          }
        }}
      >
        <div className="lb-root joey-collaboration-root h-full">
          <LiveblocksConnectionWatcher />
          {children}
        </div>
      </LiveblocksProvider>
    </LiveblocksConfigContext.Provider>
  );
}
