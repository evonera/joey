import { describe, expect, it } from "vitest";
import { manualPostSchema, validatePostForPlatforms } from "../compose-validation";
const valid = { content: "A post", mediaUrls: [], accountIds: ["account-1"], scheduleType: "draft" };
describe("composer input validation", () => {
  it("rejects duplicate targets, empty posts, and unsafe media URLs", () => {
    expect(manualPostSchema.safeParse({ ...valid, accountIds: ["a", "a"] }).success).toBe(false);
    expect(manualPostSchema.safeParse({ ...valid, content: " " }).success).toBe(false);
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "https://user:password@example.com/image.jpg"]) {
      expect(manualPostSchema.safeParse({ ...valid, mediaUrls: [url] }).success).toBe(false);
    }
  });
  it("allows media-only drafts and rejects invalid or past scheduled times", () => {
    expect(manualPostSchema.safeParse({ ...valid, content: "", mediaUrls: ["https://example.com/image.jpg"] }).success).toBe(true);
    for (const scheduledFor of [undefined, "invalid", "2020-01-01T00:00:00Z"]) {
      expect(manualPostSchema.safeParse({ ...valid, scheduleType: "scheduled", scheduledFor }).success).toBe(false);
    }
    expect(manualPostSchema.safeParse({ ...valid, scheduleType: "scheduled", scheduledFor: new Date(Date.now() + 3600000).toISOString() }).success).toBe(true);
  });
  it("prevents an edited draft from being duplicated across multiple accounts", () => {
    expect(manualPostSchema.safeParse({ ...valid, draftId: "draft-1", accountIds: ["a", "b"] }).success).toBe(false);
  });
  it("enforces the strictest selected platform and required media", () => {
    expect(validatePostForPlatforms("a".repeat(281), [], ["linkedin", "twitter"])).toContain("280");
    expect(validatePostForPlatforms("caption", [], ["instagram"])).toContain("requires a media");
    expect(validatePostForPlatforms("caption", ["https://example.com/video.mp4"], ["tiktok"])).toBeNull();
  });
});
