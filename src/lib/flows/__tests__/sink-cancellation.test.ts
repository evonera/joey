import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDraftNode } from "../nodes/actions/create-draft";
import { notifyNode } from "../nodes/actions/notify";
import { renderMediaNode } from "../nodes/actions/render-media";
import { telegramSendNode } from "../nodes/actions/telegram-send";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(), asset: vi.fn(), prefs: vi.fn(), insert: vi.fn(), submit: vi.fn(), installation: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => unknown) => fn((await import("@/lib/db")).db),
    query: {
      assets: { findFirst: mocks.asset },
      drafts: { findFirst: async () => null },
      socialAccounts: { findMany: async () => [] },
      notificationPreferences: { findFirst: mocks.prefs },
      notifications: { findFirst: async () => null },
      telegramBotInstallations: { findFirst: mocks.installation },
    },
    select: () => ({ from: () => ({ where: () => ({ for: mocks.lock }) }) }),
    insert: mocks.insert,
  },
}));
vi.mock("@/lib/media-engine/engine", () => ({ submitRender: mocks.submit, getRender: vi.fn(), cancelRender: vi.fn() }));

describe("Cancellation after async lookups at durable sinks", () => {
  let controller: AbortController;
  const ctx = () => ({ tenantId: "tenant", flowId: "flow", runId: "run", nodeId: "node", signal: controller.signal });
  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AbortController();
    mocks.lock.mockImplementation(async () => { controller.abort(new Error("stopped while waiting")); return [{ id: "run" }]; });
    mocks.prefs.mockResolvedValue({ emailDraftReady: false, inAppDraftReady: true });
  });
  it("does not insert a draft after cancellation during the run lock", async () => {
    await expect(createDraftNode.execute("content", { platform: "twitter" }, ctx())).rejects.toThrow("stopped while waiting");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not insert a notification after cancellation during the run lock", async () => {
    await expect(notifyNode.execute("content", { title: "notice" }, ctx())).rejects.toThrow("stopped while waiting");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not submit rendering after cancellation during source asset lookup", async () => {
    mocks.asset.mockImplementationOnce(async () => {
      controller.abort(new Error("stopped while waiting"));
      return { id: "asset", key: "version" };
    });
    await expect(renderMediaNode.execute("content", {
      template: "photo_headline", mediaAssetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "title", brandName: "brand",
    }, ctx())).rejects.toThrow("stopped while waiting");
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("does not enqueue Telegram after cancellation during installation lookup", async () => {
    mocks.installation.mockImplementationOnce(async () => {
      controller.abort(new Error("stopped while waiting"));
      return { id: "installation" };
    });
    await expect(telegramSendNode.execute("content", { chatId: "123", messageTemplate: "{{input}}" }, ctx())).rejects.toThrow("stopped while waiting");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
