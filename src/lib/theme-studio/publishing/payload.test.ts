import { describe, expect, it } from "vitest";
import { buildThemePublicationPayload } from "./payload";

describe("theme publication payload", () => {
  const pkg = { id: "pkg", themePageId: "page", title: "Title", caption: "First line\nSecond line", hashtags: ["#one", "#two", "#three"], renderedAssetUrls: ["https://example.com/image.png", "https://example.com/video.mp4"], scheduledFor: new Date("2030-01-01T00:00:00Z") };
  const accounts = [{ platform: "x", platformAccountId: "remote-1" }, { platform: "twitter", platformAccountId: "remote-2" }];
  it("builds the adapted text, media and all destinations for a scheduled post", () => {
    const body = buildThemePublicationPayload(pkg, { platform: "x", mediaType: "image" }, accounts, false, new Date("2029-01-01T00:00:00Z"));
    expect(body.content).toBe("First line\n\n#one #two");
    expect(body.mediaItems).toEqual([{ type: "image", url: "https://example.com/image.png", altText: "Title" }]);
    expect(body.platforms.map(account => account.accountId)).toEqual(["remote-1", "remote-2"]);
    expect(body.platforms.map(account => account.customContent)).toEqual(["First line\n\n#one #two", "First line\n\n#one #two"]);
    expect(body).toMatchObject({ scheduledFor: "2030-01-01T00:00:00.000Z" });
    expect(body).not.toHaveProperty("publishNow");
  });
  it("uses immediate delivery when explicitly publishing early", () => {
    const body = buildThemePublicationPayload(pkg, { platform: "x", mediaType: "image" }, accounts, true, new Date("2029-01-01T00:00:00Z"));
    expect(body).toMatchObject({ publishNow: true });
    expect(body).not.toHaveProperty("scheduledFor");
  });
});
