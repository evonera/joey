import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getActiveTenantId: vi.fn(),
  manageConnections: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
  getActiveTenantId: mocks.getActiveTenantId,
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/composio-connect", () => ({
  CANDIDATE_TOOLKITS: ["gmail", "slack"],
  manageConnections: mocks.manageConnections,
}));

vi.mock("@/lib/db", () => ({ db: {} }));

import { DELETE, POST } from "../route";

function requestWithJson(json: ReturnType<typeof vi.fn>) {
  return { json } as never;
}

describe("connection mutation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue("tenant-1");
  });

  it.each([
    ["POST", POST],
    ["DELETE", DELETE],
  ])("rejects an unauthenticated %s before reading its body", async (_method, handler) => {
    const json = vi.fn().mockRejectedValue(new Error("body should not be read"));
    mocks.requireRole.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await handler(requestWithJson(json));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(json).not.toHaveBeenCalled();
    expect(mocks.manageConnections).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", POST],
    ["DELETE", DELETE],
  ])("rejects a workspace member %s before reading its body", async (_method, handler) => {
    const json = vi.fn().mockRejectedValue(new Error("body should not be read"));
    mocks.requireRole.mockRejectedValueOnce(new Error("Forbidden: Action requires role owner or admin"));

    const response = await handler(requestWithJson(json));

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mocks.manageConnections).not.toHaveBeenCalled();
  });

  it("preserves POST body validation after authorization", async () => {
    const json = vi.fn().mockResolvedValue({ toolkit: "unsupported" });

    const response = await POST(requestWithJson(json));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unsupported toolkit" });
    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
    expect(json).toHaveBeenCalledOnce();
  });

  it("preserves DELETE behavior for an authorized admin", async () => {
    const json = vi.fn().mockResolvedValue({ toolkit: "slack", accountId: "account-1" });
    mocks.manageConnections.mockResolvedValueOnce({});

    const response = await DELETE(requestWithJson(json));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.manageConnections).toHaveBeenCalledWith("tenant-1", [
      { name: "slack", action: "remove", account_id: "account-1" },
    ]);
  });
});
