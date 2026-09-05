import { getModelById, getModelCost } from "@/lib/models";

export interface TokenMetrics {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheTokens: number;
  totalTokens: number;
  userPercent: number;
  assistantPercent: number;
  toolCallsPercent: number;
  otherPercent: number;
}

export interface SavedChatSession {
  id: string; // Eve sessionId
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  messageCount: number;
  tokenMetrics: TokenMetrics;
  estimatedCostUsd: number;
  session: {
    sessionId: string;
    streamIndex: number;
  };
  events: readonly any[];
  messages: any[];
}

const STORAGE_KEY = "joey_chat_sessions";

export function getStoredSessions(): SavedChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => {
      // Pinned first, then newest updated
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  } catch (err) {
    console.warn("Failed to read chat sessions from localStorage:", err);
    return [];
  }
}

export function getStoredSession(id: string): SavedChatSession | null {
  const sessions = getStoredSessions();
  return sessions.find((s) => s.id === id) || null;
}

export function saveStoredSession(session: SavedChatSession): void {
  if (typeof window === "undefined") return;
  try {
    const sessions = getStoredSessions();
    const existingIndex = sessions.findIndex((s) => s.id === session.id);
    if (existingIndex >= 0) {
      sessions[existingIndex] = {
        ...sessions[existingIndex],
        ...session,
        isPinned: sessions[existingIndex].isPinned ?? session.isPinned,
        updatedAt: new Date().toISOString(),
      };
    } else {
      sessions.unshift({
        ...session,
        createdAt: session.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn("Failed to save chat session to localStorage:", err);
  }
}

export function deleteStoredSession(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const sessions = getStoredSessions().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn("Failed to delete chat session:", err);
  }
}

export function togglePinStoredSession(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sessions = getStoredSessions();
    const target = sessions.find((s) => s.id === id);
    if (!target) return false;
    target.isPinned = !target.isPinned;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return target.isPinned;
  } catch (err) {
    console.warn("Failed to toggle pin on session:", err);
    return false;
  }
}

export function updateStoredSessionTitle(id: string, newTitle: string): void {
  if (typeof window === "undefined") return;
  try {
    const sessions = getStoredSessions();
    const target = sessions.find((s) => s.id === id);
    if (!target) return;
    target.title = newTitle.trim() || target.title;
    target.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn("Failed to update session title:", err);
  }
}

export function deriveTitleFromMessages(messages: readonly any[]): string {
  for (const msg of messages) {
    if (msg.role === "user") {
      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          if (part.type === "text" && typeof part.text === "string") {
            text += part.text;
          }
        }
      }
      text = text.replace(/\s+/g, " ").trim();
      if (text.length > 0) {
        return text.length > 42 ? `${text.slice(0, 42)}…` : text;
      }
    }
  }
  return "New chat session";
}

/**
 * Calculates token counts and cost estimation from message objects.
 * OpenCode style token breakdown: user %, assistant %, tool calls %, other %.
 */
export function calculateSessionTokensAndCost(
  messages: readonly any[],
  modelId: string
): { tokenMetrics: TokenMetrics; estimatedCostUsd: number } {
  let userChars = 0;
  let assistantChars = 0;
  let toolChars = 0;
  let reasoningChars = 0;
  let otherChars = 0;

  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        userChars += msg.content.length;
      }
      if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          if (part.type === "text" && typeof part.text === "string") {
            userChars += part.text.length;
          } else {
            otherChars += 50;
          }
        }
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        assistantChars += msg.content.length;
      }
      if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          if (part.type === "text" && typeof part.text === "string") {
            assistantChars += part.text.length;
          } else if (
            part.type === "reasoning" ||
            part.type === "thought" ||
            part.type === "thinking"
          ) {
            reasoningChars += (part.text || part.reasoning || "").length;
          } else if (
            part.type?.startsWith("tool-") ||
            part.type === "dynamic-tool" ||
            part.type === "action"
          ) {
            toolChars += JSON.stringify(part).length;
          } else {
            otherChars += 20;
          }
        }
      }
    } else {
      otherChars += typeof msg.content === "string" ? msg.content.length : 100;
    }
  }

  // Approximation: ~4 characters per token
  const userTokens = Math.ceil(userChars / 4);
  const assistantTokens = Math.ceil(assistantChars / 4);
  const toolTokens = Math.ceil(toolChars / 4);
  const reasoningTokens = Math.ceil(reasoningChars / 4);
  const otherTokens = Math.ceil(otherChars / 4);

  const inputTokens = userTokens + Math.ceil(toolTokens * 0.4);
  const outputTokens = assistantTokens + reasoningTokens + Math.ceil(toolTokens * 0.6);
  const totalTokens = Math.max(1, userTokens + assistantTokens + toolTokens + reasoningTokens + otherTokens);

  const userPercent = Number(((userTokens / totalTokens) * 100).toFixed(1));
  const assistantPercent = Number(((assistantTokens / totalTokens) * 100).toFixed(1));
  const toolCallsPercent = Number(((toolTokens / totalTokens) * 100).toFixed(1));
  const otherPercent = Number(
    Math.max(0, 100 - (userPercent + assistantPercent + toolCallsPercent)).toFixed(1)
  );

  const estimatedCostUsd = getModelCost(modelId, inputTokens, outputTokens);

  return {
    tokenMetrics: {
      inputTokens,
      outputTokens,
      reasoningTokens,
      cacheTokens: 0,
      totalTokens,
      userPercent,
      assistantPercent,
      toolCallsPercent,
      otherPercent,
    },
    estimatedCostUsd,
  };
}

export interface GroupedSessions {
  today: SavedChatSession[];
  yesterday: SavedChatSession[];
  thisWeek: SavedChatSession[];
  older: SavedChatSession[];
}

export function groupSessionsByDate(sessions: SavedChatSession[]): GroupedSessions {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  const grouped: GroupedSessions = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  for (const s of sessions) {
    const time = new Date(s.updatedAt || s.createdAt).getTime();
    if (time >= todayStart) {
      grouped.today.push(s);
    } else if (time >= yesterdayStart) {
      grouped.yesterday.push(s);
    } else if (time >= weekStart) {
      grouped.thisWeek.push(s);
    } else {
      grouped.older.push(s);
    }
  }

  return grouped;
}
