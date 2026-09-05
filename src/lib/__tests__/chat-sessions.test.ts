import { describe, expect, it, beforeEach } from "vitest";
import {
  deriveTitleFromMessages,
  calculateSessionTokensAndCost,
  groupSessionsByDate,
  getStoredSessions,
  saveStoredSession,
  getStoredSession,
  deleteStoredSession,
  togglePinStoredSession,
  updateStoredSessionTitle,
  type SavedChatSession,
} from "@/lib/chat-sessions";

describe("chat-sessions utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("deriveTitleFromMessages", () => {
    it("extracts title from first user message string content", () => {
      const messages = [
        { role: "user", content: "Draft a viral 𝕏 thread on AI agents" },
        { role: "assistant", content: "Sure, here is your thread..." },
      ];
      expect(deriveTitleFromMessages(messages)).toBe("Draft a viral 𝕏 thread on AI agents");
    });

    it("extracts title from user message with parts array", () => {
      const messages = [
        {
          role: "user",
          parts: [{ type: "text", text: "Create an automated visual flow" }],
        },
      ];
      expect(deriveTitleFromMessages(messages)).toBe("Create an automated visual flow");
    });

    it("truncates very long user prompts cleanly with ellipsis", () => {
      const messages = [
        {
          role: "user",
          content:
            "This is an extremely long message that should definitely be truncated beyond forty-two characters because it exceeds the header limit.",
        },
      ];
      const title = deriveTitleFromMessages(messages);
      expect(title.endsWith("…")).toBe(true);
      expect(title.length).toBeLessThanOrEqual(44);
    });

    it("returns default title when no user messages exist", () => {
      expect(deriveTitleFromMessages([])).toBe("New chat session");
      expect(deriveTitleFromMessages([{ role: "assistant", content: "Hello!" }])).toBe("New chat session");
    });
  });

  describe("calculateSessionTokensAndCost", () => {
    it("computes token metrics, breakdown percentages, and estimated USD cost", () => {
      const messages = [
        { role: "user", content: "Hello Joey, write a marketing tweet." },
        {
          role: "assistant",
          content: "Here is your tweet: 🚀 Supercharge your brand today!",
          parts: [
            { type: "reasoning", reasoning: "Thinking about engaging angles" },
            { type: "text", text: "Here is your tweet: 🚀 Supercharge your brand today!" },
          ],
        },
      ];

      const { tokenMetrics, estimatedCostUsd } = calculateSessionTokensAndCost(
        messages,
        "google/gemini-3.6-flash"
      );

      expect(tokenMetrics.totalTokens).toBeGreaterThan(0);
      expect(tokenMetrics.inputTokens).toBeGreaterThan(0);
      expect(tokenMetrics.outputTokens).toBeGreaterThan(0);
      expect(tokenMetrics.userPercent).toBeGreaterThanOrEqual(0);
      expect(tokenMetrics.assistantPercent).toBeGreaterThanOrEqual(0);

      const sumPercent =
        tokenMetrics.userPercent +
        tokenMetrics.assistantPercent +
        tokenMetrics.toolCallsPercent +
        tokenMetrics.otherPercent;
      expect(sumPercent).toBeCloseTo(100, 0);

      expect(typeof estimatedCostUsd).toBe("number");
      expect(estimatedCostUsd).toBeGreaterThanOrEqual(0);
    });
  });

  describe("groupSessionsByDate", () => {
    it("groups sessions into Today, Yesterday, This Week, and Older", () => {
      const now = new Date();
      const today = now.toISOString();
      const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
      const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 3600 * 1000).toISOString();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();

      const createSession = (id: string, date: string): SavedChatSession => ({
        id,
        title: `Session ${id}`,
        model: "google/gemini-3.6-flash",
        createdAt: date,
        updatedAt: date,
        messageCount: 2,
        tokenMetrics: {
          inputTokens: 100,
          outputTokens: 100,
          reasoningTokens: 0,
          cacheTokens: 0,
          totalTokens: 200,
          userPercent: 50,
          assistantPercent: 50,
          toolCallsPercent: 0,
          otherPercent: 0,
        },
        estimatedCostUsd: 0.0001,
        session: { sessionId: id, streamIndex: 2 },
        events: [],
        messages: [],
      });

      const sessions = [
        createSession("1", today),
        createSession("2", yesterday),
        createSession("3", fourDaysAgo),
        createSession("4", twoWeeksAgo),
      ];

      const grouped = groupSessionsByDate(sessions);
      expect(grouped.today.map((s) => s.id)).toContain("1");
      expect(grouped.yesterday.map((s) => s.id)).toContain("2");
      expect(grouped.thisWeek.map((s) => s.id)).toContain("3");
      expect(grouped.older.map((s) => s.id)).toContain("4");
    });
  });

  describe("Session Storage CRUD", () => {
    const mockSession: SavedChatSession = {
      id: "sess_123",
      title: "Test Session",
      model: "google/gemini-3.6-flash",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 4,
      tokenMetrics: {
        inputTokens: 500,
        outputTokens: 1000,
        reasoningTokens: 100,
        cacheTokens: 0,
        totalTokens: 1600,
        userPercent: 30,
        assistantPercent: 60,
        toolCallsPercent: 10,
        otherPercent: 0,
      },
      estimatedCostUsd: 0.0004,
      session: { sessionId: "sess_123", streamIndex: 4 },
      events: [],
      messages: [],
    };

    it("saves and retrieves session from localStorage", () => {
      saveStoredSession(mockSession);
      const retrieved = getStoredSession("sess_123");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe("Test Session");
      expect(retrieved?.tokenMetrics.totalTokens).toBe(1600);
    });

    it("toggles pin status on session", () => {
      saveStoredSession(mockSession);
      const pinned = togglePinStoredSession("sess_123");
      expect(pinned).toBe(true);
      expect(getStoredSession("sess_123")?.isPinned).toBe(true);

      const unpinned = togglePinStoredSession("sess_123");
      expect(unpinned).toBe(false);
      expect(getStoredSession("sess_123")?.isPinned).toBe(false);
    });

    it("renames session title", () => {
      saveStoredSession(mockSession);
      updateStoredSessionTitle("sess_123", "Brand Strategy Q3");
      expect(getStoredSession("sess_123")?.title).toBe("Brand Strategy Q3");
    });

    it("deletes session", () => {
      saveStoredSession(mockSession);
      expect(getStoredSessions().length).toBe(1);
      deleteStoredSession("sess_123");
      expect(getStoredSessions().length).toBe(0);
      expect(getStoredSession("sess_123")).toBeNull();
    });
  });
});
