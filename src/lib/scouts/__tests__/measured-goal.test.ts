import { describe, expect, it } from "vitest";
import { evaluateMeasuredGoal } from "../measured-goal";
import { observedMetric, observedTimestamp } from "../post-evidence";
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
});
