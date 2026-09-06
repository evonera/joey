"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import { LiveblocksProvider } from "@liveblocks/react";
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
      >
        <div className="lb-root joey-collaboration-root h-full">
          {children}
        </div>
      </LiveblocksProvider>
    </LiveblocksConfigContext.Provider>
  );
}
