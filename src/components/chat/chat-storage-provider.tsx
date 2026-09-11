"use client";

import { createContext, useContext, type ReactNode } from "react";

const ChatStorageContext = createContext<string | null>(null);

export function ChatStorageProvider({ scope, children }: { scope: string; children: ReactNode }) {
  return <ChatStorageContext.Provider value={scope}>{children}</ChatStorageContext.Provider>;
}

export function useChatStorageScope() {
  const scope = useContext(ChatStorageContext);
  if (!scope) throw new Error("Chat history requires an authenticated workspace.");
  return scope;
}
