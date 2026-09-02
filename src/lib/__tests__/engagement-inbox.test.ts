import { describe, expect, it } from "vitest";
import {
  boundedInboxSyncLimits,
  engagementEventCategory,
  themeStudioDmRetryDelayMs,
  ZERNIO_ENGAGEMENT_EVENTS,
} from "../engagement-inbox";

describe("unified engagement inbox contracts", () => {
  it("recognizes every supported inbox lifecycle event", () => {
    expect([...ZERNIO_ENGAGEMENT_EVENTS].map(engagementEventCategory)).toEqual([
      "comment",
      "conversation",
      "message",
      "message",
      "message",
      "message",
      "message",
      "message",
      "message",
      "reaction",
      "review",
      "review",
    ]);
    expect(engagementEventCategory("post.published")).toBeNull();
    expect(engagementEventCategory("message.unknown")).toBeNull();
  });

  it("keeps manual backfills within bounded API pages", () => {
    expect(boundedInboxSyncLimits()).toEqual({ conversations: 10, messagesPerConversation: 50 });
    expect(boundedInboxSyncLimits({ conversations: 0, messagesPerConversation: 1000 })).toEqual({ conversations: 1, messagesPerConversation: 100 });
    expect(boundedInboxSyncLimits({ conversations: 500, messagesPerConversation: -2 })).toEqual({ conversations: 25, messagesPerConversation: 1 });
  });

  it("backs off failed Theme Studio private replies without unbounded delays", () => {
    expect(themeStudioDmRetryDelayMs(1)).toBe(60_000);
    expect(themeStudioDmRetryDelayMs(3)).toBe(240_000);
    expect(themeStudioDmRetryDelayMs(30)).toBe(3_600_000);
  });
});
