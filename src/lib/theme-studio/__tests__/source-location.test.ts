import { describe, expect, it } from "vitest";
import { normalizeThemeSourceLocation } from "@/lib/theme-studio/source-location";

describe("normalizeThemeSourceLocation", () => {
  it("adds HTTPS to a bare HTTP source hostname so the worker can fetch it", () => {
    expect(normalizeThemeSourceLocation("http", "  api.example.com/feed  ")).toBe("https://api.example.com/feed");
  });

  it("preserves an explicit protocol and non-HTTP source formats", () => {
    expect(normalizeThemeSourceLocation("http", "http://api.example.com/feed")).toBe("http://api.example.com/feed");
    expect(normalizeThemeSourceLocation("reddit", "r/socialmedia")).toBe("r/socialmedia");
    expect(normalizeThemeSourceLocation("exa_topic", "creator economy")).toBe("creator economy");
  });
});
