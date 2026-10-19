// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), currentNotification: vi.fn(), legacyNotifications: vi.fn(), inserts: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
import { completeScoutEvaluation, scoutAlertFingerprint } from "../evaluation-receipts";
import type { ScoutAlert } from "../evaluator";

const old: ScoutAlert = { title: "Upload", detectedAt: "2026-10-11", targetUrl: "https://youtube.com/@source", platform: "youtube", goal: "A new upload", changes: [{ type: "ADDED", label: "Upload", after: "Added", rationale: "New video" }], samplePost: { url: "https://youtube.com/shorts/abcdefghijk", content: "Feed title and copy" } };
const next: ScoutAlert = { ...old, samplePost: { url: "https://www.youtube.com/watch?v=abcdefghijk", content: "Actual API description", views: 1234 } };
const receipt = { id: "receipt", tenantId: "tenant", scoutId: "scout", leaseToken: "lease" } as Parameters<typeof completeScoutEvaluation>[0];
const scout = { id: "scout", tenantId: "tenant", name: "Source", targetUrl: old.targetUrl, platform: "youtube", goalCondition: old.goal, isActive: true, pollIntervalMinutes: 15, latestAlert: null, updatedAt: new Date("2026-10-19T00:00:00Z") } as Parameters<typeof completeScoutEvaluation>[1];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.currentNotification.mockResolvedValue(undefined);
  mocks.legacyNotifications.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (callback) => callback({
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: "saved" }] }) }) }),
    insert: () => ({ values: mocks.inserts }),
    query: { notifications: { findFirst: mocks.currentNotification, findMany: mocks.legacyNotifications } },
  }));
});

describe("YouTube legacy notification compatibility", () => {
  it("suppresses a prior notification despite its obsolete feed hash and enriched API metadata", async () => {
    const metadata = { ...old, fingerprint: "obsolete-raw-shorts-hash", scoutId: "scout" };
    mocks.legacyNotifications.mockResolvedValue([{ id: "old-notification", metadata }]);
    await completeScoutEvaluation(receipt, scout, { triggered: true, alert: next, itemsFound: 1 });
    // The run/evidence still completes, while no second notification is inserted.
    expect(mocks.inserts).toHaveBeenCalledTimes(1);
    expect(mocks.inserts.mock.calls[0][0]).toMatchObject({ status: "alert_triggered" });
    expect(metadata.fingerprint).toBe("obsolete-raw-shorts-hash");
    expect(metadata.samplePost?.url).toContain("/shorts/");
    const lookup = mocks.legacyNotifications.mock.calls[0][0];
    expect(lookup).toMatchObject({ limit: 100, columns: { id: true, metadata: true } });
  });
  it("uses normalized latestAlert immediately without a legacy history lookup", async () => {
    await completeScoutEvaluation(receipt, { ...scout, latestAlert: old }, { triggered: true, alert: next, itemsFound: 1 });
    expect(mocks.legacyNotifications).not.toHaveBeenCalled();
    expect(mocks.inserts).toHaveBeenCalledTimes(1);
  });
  it("persists a canonical versioned fingerprint for a genuinely new video", async () => {
    await completeScoutEvaluation(receipt, scout, { triggered: true, alert: next, itemsFound: 1 });
    expect(mocks.inserts).toHaveBeenCalledTimes(2);
    expect(mocks.inserts.mock.calls[1][0]).toMatchObject({ type: "scout_alert", metadata: { fingerprintVersion: 2, fingerprint: scoutAlertFingerprint(next) } });
  });
  it("retains distinct measured counter increases rather than suppressing all future video alerts", async () => {
    const spike: ScoutAlert = { ...next, changes: [{ type: "SPIKE", label: "Views", after: "1234", rationale: "Measured" }] };
    mocks.legacyNotifications.mockResolvedValue([{ id: "old-notification", metadata: { ...spike, samplePost: { ...spike.samplePost!, views: 1000 } } }]);
    await completeScoutEvaluation(receipt, scout, { triggered: true, alert: spike, itemsFound: 1 });
    expect(mocks.inserts).toHaveBeenCalledTimes(2);
  });
});
