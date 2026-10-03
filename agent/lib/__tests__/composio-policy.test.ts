import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ member: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { member: { findFirst: mocks.member } } } }));
import { composioApproval, composioConnectionApproval } from "../composio-policy";

function context(toolName = "composio__COMPOSIO_MULTI_EXECUTE_TOOL") {
  const principal = { principalType: "user", principalId: JSON.stringify(["user", "tenant"]), attributes: { tenantId: "tenant" } };
  return { toolName, approvedTools: [toolName], session: { auth: { current: principal, initiator: principal } } };
}
beforeEach(() => { mocks.member.mockReset(); });

describe("Composio Eve approval policy", () => {
  it("requires explicit human approval for account authorization and tool execution", () => {
    expect(composioConnectionApproval("composio__COMPOSIO_MANAGE_CONNECTIONS")).toBe("user-approval");
    expect(composioConnectionApproval("composio__COMPOSIO_MULTI_EXECUTE_TOOL")).toBe("user-approval");
  });

  it("allows only non-mutating discovery and schema lookup without a prompt", () => {
    expect(composioConnectionApproval("composio__COMPOSIO_SEARCH_TOOLS")).toBe("not-applicable");
    expect(composioConnectionApproval("composio__COMPOSIO_GET_TOOL_SCHEMAS")).toBe("not-applicable");
  });

  it.each(["UNKNOWN", "evil_COMPOSIO_MULTI_EXECUTE_TOOL", "other__COMPOSIO_SEARCH_TOOLS"])("denies unknown tool %s", async name => {
    expect(composioConnectionApproval(name)).toBe("denied");
    expect(await composioApproval().request(context(name) as never)).toMatchObject({ type: "denied" });
    expect(mocks.member).not.toHaveBeenCalled();
  });
  it("does not treat prior approval as an authorization grant", async () => {
    mocks.member.mockResolvedValue(undefined);
    expect(await composioApproval().request(context() as never)).toMatchObject({ type: "denied" });
    expect(mocks.member).toHaveBeenCalledOnce();
  });
  it("allows a currently authorized approver but still requires confirmation", async () => {
    mocks.member.mockResolvedValue({ id: "membership" });
    expect(await composioApproval().request(context() as never)).toBe("user-approval");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    expect(new PgDialect().sqlToQuery(mocks.member.mock.calls[0][0].where).params).toEqual(["tenant", "user", "owner", "admin"]);
  });
  it("preserves discovery for current workspace members", async () => {
    mocks.member.mockResolvedValue({ id: "membership" });
    expect(await composioApproval().request(context("COMPOSIO_SEARCH_TOOLS") as never)).toBe("not-applicable");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    expect(new PgDialect().sqlToQuery(mocks.member.mock.calls[0][0].where).params).toEqual(["tenant", "user"]);
  });
  it("rejects a foreign initiating workspace before lookup", async () => {
    const ctx = context();
    ctx.session.auth.initiator.attributes.tenantId = "foreign";
    // Current and initiator must be separate snapshots.
    ctx.session.auth.current = { ...ctx.session.auth.current, attributes: { tenantId: "tenant" } };
    expect(await composioApproval().request(ctx as never)).toMatchObject({ type: "denied" });
    expect(mocks.member).not.toHaveBeenCalled();
  });
  it("rechecks roles at approval resume, including revocation", async () => {
    const ctx = context();
    const response = {
      request: { toolName: ctx.toolName }, responder: ctx.session.auth.current,
      session: { initiator: ctx.session.auth.initiator },
    };
    mocks.member.mockResolvedValue({ id: "membership" });
    expect(await composioApproval().response!(response as never)).toEqual({ status: "allowed" });
    mocks.member.mockResolvedValue(undefined);
    expect(await composioApproval().response!(response as never)).toMatchObject({ status: "rejected" });
  });
  it("fails closed when authorization lookup fails", async () => {
    mocks.member.mockImplementation(() => { throw new Error("DB unavailable"); });
    expect(await composioApproval().request(context() as never)).toMatchObject({ type: "denied" });
  });
});
