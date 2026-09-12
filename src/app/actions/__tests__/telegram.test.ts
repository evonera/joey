import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  installTelegramBot: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getActiveTenantId: vi.fn(),
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/telegram", () => ({
  installTelegramBot: mocks.installTelegramBot,
  telegramInstallationStatus: vi.fn(),
}));

import { connectTelegramBot } from "../telegram";

describe("connectTelegramBot authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://joey.test";
  });

  it("authorizes before returning configuration validation", async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(connectTelegramBot("invalid", [])).resolves.toEqual({
      error: "Sign in to manage Telegram approvals.",
    });

    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
    expect(mocks.installTelegramBot).not.toHaveBeenCalled();
  });

  it("returns an explicit role error for workspace members", async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error("Forbidden: Action requires role owner or admin"));

    await expect(connectTelegramBot("invalid", [])).resolves.toEqual({
      error: "Only workspace owners and admins can manage Telegram approvals.",
    });

    expect(mocks.installTelegramBot).not.toHaveBeenCalled();
  });
});
