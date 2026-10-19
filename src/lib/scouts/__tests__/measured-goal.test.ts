import { describe, expect, it } from "vitest";
import { evaluateMeasuredGoal, measuredPostIncreases } from "../measured-goal";
import { canonicalScoutPostUrl, normalizeScoutPostEvidence, observedMetric, observedTimestamp, scoutPostIdentity, youtubeScoutVideoId } from "../post-evidence";
import { scoutAlertFingerprint } from "../evaluation-receipts";
import type { ScoutAlert } from "../evaluator";
const post = { id: "post", url: "https://instagram.com/p/post", text: "Caption", views: 60000, observedAt: "2026-10-11T03:00:00Z" };
describe("measured Scout goals", () => {
  it("uses observed thresholds without inventing a baseline", () => {
    expect(evaluateMeasuredGoal("views > 50k", [post])).toMatchObject({ triggered: true, changes: [{ type: "ADDED", after: "60000 views" }] });
    expect(evaluateMeasuredGoal("views > 50k", [{ ...post, views: undefined }])).toMatchObject({ triggered: false });
    expect(evaluateMeasuredGoal("likes >= 0", [{ ...post, likes: 0 }])).toMatchObject({ triggered: true });
  });
  it("requires dated matching observations for measured growth", () => {
    const prior = { ...post, views: 40000, observedAt: "2026-10-10T03:00:00Z" };
    expect(evaluateMeasuredGoal("views growth >= 50%", [post], [prior])).toMatchObject({ triggered: true, changes: [{ type: "SPIKE", before: expect.stringContaining("40000") }] });
    for (const invalid of [[], [{ ...prior, id: "other" }], [{ ...prior, views: 0 }], [{ ...prior, observedAt: undefined }], [{ ...prior, observedAt: post.observedAt }]]) {
      expect(evaluateMeasuredGoal("views growth > 10%", [post], invalid)).toMatchObject({ triggered: false });
    }
  });
  it("leaves qualitative and mixed conditions to their existing evaluator", () => {
    expect(evaluateMeasuredGoal("Views > 50k or a new hook", [post])).toBeNull();
    expect(evaluateMeasuredGoal("likes growth > 1k", [post])).toBeNull();
  });
  it("preserves unknown values and genuine zero observations", () => {
    for (const value of [null, undefined, "", "bad", -1, Infinity, true]) expect(observedMetric(value)).toBeUndefined();
    expect(observedMetric(0)).toBe(0);
    expect(observedTimestamp(undefined)).toBeUndefined();
    expect(observedTimestamp("yesterday")).toBeUndefined();
    expect(observedTimestamp(1791590400)).toBe(new Date(1791590400 * 1000).toISOString());
  });
  it("deduplicates the same evidence despite rewritten model explanations", () => {
    const alert: ScoutAlert = { title: "One", detectedAt: "2026-10-11", targetUrl: "https://instagram.com/source", platform: "instagram", goal: "Popular", changes: [], samplePost: { url: post.url, content: post.text, views: post.views } };
    expect(scoutAlertFingerprint(alert)).toBe(scoutAlertFingerprint({ ...alert, title: "Two", changes: [{ type: "ADDED", label: "Reworded", after: "Still same count", rationale: "Different phrasing" }] }));
    expect(scoutAlertFingerprint(alert)).not.toBe(scoutAlertFingerprint({ ...alert, samplePost: { ...alert.samplePost!, views: 70000 } }));
  });
  it("joins historical YouTube Shorts evidence to API watch links without rewriting the saved evidence", () => {
    const old = { ...post, id: "old-feed-hash", url: "https://www.youtube.com/shorts/abcdefghijk", views: 40000, observedAt: "2026-10-10T03:00:00Z" };
    const current = { ...post, id: scoutPostIdentity("https://www.youtube.com/watch?v=abcdefghijk"), url: "https://www.youtube.com/watch?v=abcdefghijk" };
    expect(evaluateMeasuredGoal("views growth >= 50%", [current], [old])).toMatchObject({ triggered: true });
    expect(measuredPostIncreases(current, [old])).toMatchObject([{ type: "SPIKE", before: expect.stringContaining("40000 views") }]);
    expect(normalizeScoutPostEvidence(old)).toMatchObject({ id: current.id, url: current.url, observedAt: old.observedAt });
    expect(old.id).toBe("old-feed-hash");
    expect(old.url).toContain("/shorts/");
    expect(evaluateMeasuredGoal("views growth >= 50%", [current], [{ ...old, url: "https://youtube.com/shorts/other123456" }])).toMatchObject({ triggered: false });
    expect(measuredPostIncreases(current, [{ ...old, views: undefined }])).toEqual([]);
  });
  it.each(["https://youtu.be/abcdefghijk?t=12", "https://youtube.com/shorts/abcdefghijk", "https://m.youtube.com/watch?feature=share&v=abcdefghijk&t=4", "https://www.youtube.com/embed/abcdefghijk", "https://youtube.com/live/abcdefghijk/"])("canonicalizes %s to the same YouTube identity", (url) => {
    const canonical = "https://www.youtube.com/watch?v=abcdefghijk";
    expect(canonicalScoutPostUrl(url)).toBe(canonical);
    expect(scoutPostIdentity(url)).toBe(scoutPostIdentity(canonical));
  });
  it.each(["https://youtube.com.attacker.net/shorts/abcdefghijk", "https://evil.youtube.com/shorts/abcdefghijk", "https://youtube.com/shorts/invalid", "http://youtube.com/watch?v=abcdefghijk", "https://youtu.be:444/abcdefghijk"])("does not merge an untrusted or invalid URL %s", (url) => {
    expect(youtubeScoutVideoId(url)).toBeUndefined();
  });
  it("does not announce the same YouTube post again when the API enriches old feed evidence", () => {
    const old: ScoutAlert = { title: "Upload", detectedAt: "2026-10-11", targetUrl: "https://youtube.com/@source", platform: "youtube", goal: "A new upload", changes: [{ type: "ADDED", label: "Upload", after: "Added", rationale: "New video" }], samplePost: { url: "https://youtube.com/shorts/abcdefghijk", content: "Feed title and copy" } };
    const next = { ...old, samplePost: { url: "https://www.youtube.com/watch?v=abcdefghijk", content: "API title and real description", views: 1234, likes: 123 } };
    expect(scoutAlertFingerprint(old)).toBe(scoutAlertFingerprint(next));
    expect(scoutAlertFingerprint(next)).not.toBe(scoutAlertFingerprint({ ...next, goal: "Different goal" }));
    const spike: ScoutAlert = { ...next, changes: [{ type: "SPIKE", label: "Views", after: "1234", rationale: "Measured increase" }] };
    expect(scoutAlertFingerprint(spike)).not.toBe(scoutAlertFingerprint({ ...spike, samplePost: { ...next.samplePost, views: 2000 } }));
    const changed: ScoutAlert = { ...next, changes: [{ type: "CHANGED", label: "Title", after: "Renamed", rationale: "Observed edit" }] };
    expect(scoutAlertFingerprint(changed)).not.toBe(scoutAlertFingerprint({ ...changed, samplePost: { ...next.samplePost, content: "New changed title" } }));
  });
});
