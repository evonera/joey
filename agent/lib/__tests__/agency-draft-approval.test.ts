import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import type { ApprovalConfiguration } from "eve/tools/approval";

const mocks = vi.hoisted(() => ({ member: vi.fn(), profile: vi.fn(), step: vi.fn() }));
vi.mock("eve/tools", () => ({ defineTool: (definition: unknown) => definition }));
vi.mock("@/lib/agency/service", () => ({ requireAgencyMember: mocks.member, getAgencyProfile: mocks.profile }));
vi.mock("../agency-workflow", () => ({ conversationDraftStep: mocks.step }));
vi.mock("@/lib/agency/automation", () => ({ requireAgencyAutomationEnabled: () => {
  if (process.env.AGENCY_AUTOMATION_ENABLED !== "true") throw new Error("Disabled");
} }));
import tool from "../../tools/agency_draft";
const approval = tool.approval as ApprovalConfiguration;
const attributes = { tenantId: "tenant", userId: "owner", customAgentId: "agent", customAgentVersion: "2" };
const principal = { authenticator: "better-auth", principalType: "user", attributes };
const request = () => ({ session: { auth: { initiator: principal, current: principal } } });
const response = () => ({ session: { initiator: principal }, responder: principal });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AGENCY_AUTOMATION_ENABLED", "true");
  mocks.member.mockResolvedValue({ role: "owner" });
  mocks.profile.mockResolvedValue({ state: "active", configVersion: 2, approvedVersion: 2 });
});
afterEach(() => vi.unstubAllEnvs());

describe("Draft-only Eve approval boundaries", () => {
  it("requires a fresh real user approval, not automatic approval", async () => {
    expect(await approval.request(request() as never)).toBe("user-approval");
  });
  it.each(["member", "viewer"])("denies a %s even inside a custom agent session", async role => {
    mocks.member.mockResolvedValue({ role });
    expect(await approval.request(request() as never)).toMatchObject({ type: "denied" });
  });
  it("cannot invoke automation from a general Joey chat", async () => {
    expect(await approval.request({ session: { auth: {} } } as never)).toMatchObject({ type: "denied" });
  });
  it("denies a changed current-turn identity", async () => {
    const ctx = request();
    ctx.session.auth.current = { ...principal, attributes: { ...attributes, tenantId: "foreign" } };
    expect(await approval.request(ctx as never)).toMatchObject({ type: "denied" });
  });
  it.each([{ state: "paused" }, { configVersion: 3 }, { approvedVersion: null }])("denies stale or paused activation %j", async changes => {
    mocks.profile.mockResolvedValue({ state: "active", configVersion: 2, approvedVersion: 2, ...changes });
    expect(await approval.request(request() as never)).toMatchObject({ type: "denied" });
    expect(await approval.response!(response() as never)).toMatchObject({ status: "rejected" });
  });
  it("accepts the same currently authorized owner responding to the real request", async () => {
    expect(await approval.response!(response() as never)).toEqual({ status: "allowed" });
    expect(mocks.profile).toHaveBeenCalledWith({ tenantId: "tenant", userId: "owner" }, "agent");
  });
  it.each(["tenantId", "userId", "customAgentId"] as const)("rejects a spoofed responder %s", async field => {
    const ctx = response();
    ctx.responder = { ...principal, attributes: { ...attributes, [field]: "foreign" } };
    expect(await approval.response!(ctx as never)).toMatchObject({ status: "rejected" });
  });
  it.each([{ authenticator: "app" }, { principalType: "runtime" }])("rejects a runtime/non-browser principal %j", async changes => {
    const ctx = response();
    ctx.responder = { ...principal, ...changes };
    expect(await approval.response!(ctx as never)).toMatchObject({ status: "rejected" });
  });
  it("rechecks membership when the previously eligible owner answers", async () => {
    expect(await approval.request(request() as never)).toBe("user-approval");
    mocks.member.mockResolvedValue({ role: "member" });
    expect(await approval.response!(response() as never)).toMatchObject({ status: "rejected" });
  });
  it("the operator kill switch denies requests and still-pending responses", async () => {
    vi.stubEnv("AGENCY_AUTOMATION_ENABLED", "false");
    expect(await approval.request(request() as never)).toMatchObject({ type: "denied" });
    expect(await approval.response!(response() as never)).toMatchObject({ status: "rejected" });
  });
  it("has no arbitrary action, accounts or tenant input surface", () => {
    const schema = tool.inputSchema as ZodType;
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ action: "publish", tenantId: "foreign" }).success).toBe(false);
  });
});
