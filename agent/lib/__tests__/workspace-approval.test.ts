import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { query: { member: { findFirst } } },
}));

vi.mock("@/lib/db/schema", () => ({
  member: {
    organizationId: "organizationId",
    userId: "userId",
    role: "role",
  },
}));

import { workspaceApproval } from "../workspace-approval";

function responseContext(overrides: Record<string, unknown> = {}) {
  return {
    auth: {},
    request: { callId: "call-1", requestId: "request-1", toolName: "trigger_flow" },
    response: { decision: "approve" },
    responder: {
      authenticator: "better-auth",
      principalId: JSON.stringify(["user-1", "tenant-1"]),
      principalType: "user",
      attributes: { tenantId: "tenant-1" },
    },
    session: {
      id: "session-1",
      initiator: {
        authenticator: "better-auth",
        principalId: JSON.stringify(["user-1", "tenant-1"]),
        principalType: "user",
        attributes: { tenantId: "tenant-1" },
      },
      turn: { id: "turn-1", sequence: 0 },
    },
    ...overrides,
  } as never;
}

describe("workspaceApproval", () => {
  beforeEach(() => findFirst.mockReset());

  it("requires approval for an interactive caller", async () => {
    const approval = workspaceApproval();
    await expect(
      approval.request({ session: { auth: { current: { authenticator: "better-auth" } } } } as never),
    ).resolves.toBe("user-approval");
  });

  it("allows a workspace owner or admin to answer the approval", async () => {
    findFirst.mockResolvedValue({ id: "membership-1" });
    const approval = workspaceApproval();
    await expect(approval.response?.(responseContext())).resolves.toEqual({ status: "allowed" });
  });

  it("rejects a responder from a different workspace", async () => {
    const approval = workspaceApproval();
    const ctx = responseContext({
      responder: {
        authenticator: "better-auth",
        principalId: JSON.stringify(["user-2", "tenant-2"]),
        principalType: "user",
        attributes: { tenantId: "tenant-2" },
      },
    });
    await expect(approval.response?.(ctx)).resolves.toMatchObject({ status: "rejected" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("auto-approves only a verified owner automation", async () => {
    findFirst.mockResolvedValue({ id: "membership-1" });
    const approval = workspaceApproval({ allowOwnerAutomation: true });
    const ctx = {
      session: {
        auth: {
          current: {
            authenticator: "cron",
            principalId: "user-1",
            principalType: "user",
            attributes: { tenantId: "tenant-1" },
          },
        },
      },
    } as never;
    await expect(approval.request(ctx)).resolves.toEqual({
      type: "approved",
      reason: "Authorized workspace-owner automation.",
    });
  });
});
