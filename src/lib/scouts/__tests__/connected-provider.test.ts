import { describe, expect, it } from "vitest";
import { connectedScoutItems } from "../connected-provider";
const platform = { accountId: "own", platform: "instagram", status: "published", syncStatus: "synced", platformPostUrl: "https://www.instagram.com/p/verified/", analytics: { views: 5, likes: 0 } };
const post = { status: "published", profileId: "profile", content: "Original caption", publishedAt: "2026-10-18T12:00:00Z", platforms: [platform] };
describe("connected social observations", () => {
  it("keeps stable individual post identity and measured zero, while omitting unknown metrics", () => {
    const [item] = connectedScoutItems([post], "own", "instagram", "profile");
    expect(item).toMatchObject({ id: expect.stringMatching(/^url:/), views: 5, likes: 0, timestamp: "2026-10-18T12:00:00.000Z" });
    const [unknown] = connectedScoutItems([{ ...post, platforms: [{ ...platform, analytics: {} }] }], "own", "instagram", "profile");
    expect(unknown).not.toHaveProperty("views"); expect(unknown).not.toHaveProperty("likes");
  });
  it("ignores foreign accounts/profiles, unpublished posts and unsynced counters", () => {
    expect(connectedScoutItems([
      { ...post, profileId: "foreign" }, { ...post, status: "scheduled" },
      { ...post, platforms: [{ ...platform, accountId: "foreign" }] },
      { ...post, platforms: [{ ...platform, syncStatus: "pending" }] },
    ], "own", "instagram", "profile")).toEqual([]);
  });
  it("deduplicates posts by canonical URL", () => {
    expect(connectedScoutItems([post, post], "own", "instagram", "profile")).toHaveLength(1);
  });
});
