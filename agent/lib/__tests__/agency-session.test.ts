import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), thread: vi.fn() }));
vi.mock("@/lib/agency/service", () => ({ getAgencyProfile: mocks.profile }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/db", () => ({ db: { query: { eveSessionOwners: { findFirst: mocks.thread } } } }));
import { agencySessionIdentity, agencyProfileForSession, assertGeneralWorkspaceTool } from "../agency-session";
import { authorizeAgencyRoute } from "../agency-route-auth";
const attrs = { tenantId: "tenant", userId: "user", customAgentId: "agent", customAgentVersion: "2" };
const session = { auth: { current: { attributes: attrs }, initiator: { attributes: attrs } } } as never;
describe("Agency Eve authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.profile.mockResolvedValue({ id: "agent", configVersion: 2, state: "paused" });
    mocks.thread.mockResolvedValue({ tenantId: "tenant", userId: "user", agentId: "agent", configVersion: 2 });
  });
  it("rejects malformed identity, header downgrades and non-draft workspace tools", () => {
    expect(agencySessionIdentity(session)).toMatchObject({ version: 2, tenantId: "tenant" });
    expect(() => assertGeneralWorkspaceTool(session)).toThrow("draft-only");
    expect(() => agencySessionIdentity({ auth: { initiator: { attributes: attrs }, current: { attributes: { tenantId: "tenant", userId: "user" } } } } as never)).toThrow("cannot change");
  });
  it("rechecks config before model/tool use", async () => {
    mocks.profile.mockResolvedValue({ configVersion: 3 });
    await expect(agencyProfileForSession(session)).rejects.toThrow("configuration changed");
  });
  it("never falls through to localhost/OIDC for anonymous agency access", async () => {
    await expect(authorizeAgencyRoute(new Request("https://joey.test/eve/v1/session/private/stream"), null)).rejects.toThrow("Sign in");
  });
  it("rejects foreign tenants/users even with the agent header removed", async () => {
    for (const actor of [{ tenantId: "other", userId: "user" }, { tenantId: "tenant", userId: "other" }]) await expect(authorizeAgencyRoute(new Request("https://joey.test/eve/v1/session/private/stream"), actor)).rejects.toThrow("Conversation not found");
  });
  it("protects normal Joey sessions too instead of treating an absent persona header as permission", async () => {
    mocks.thread.mockResolvedValue({ tenantId: "tenant", userId: "user", agentId: null, configVersion: null });
    const request = new Request("https://joey.test/eve/v1/session/normal/stream");
    await expect(authorizeAgencyRoute(request, { tenantId: "tenant", userId: "user" })).resolves.toBeNull();
    await expect(authorizeAgencyRoute(request, { tenantId: "tenant", userId: "other" })).rejects.toThrow("Conversation not found");
    await expect(authorizeAgencyRoute(request, null)).rejects.toThrow("Sign in");
  });
  it("refuses unknown session IDs in an agency scope", async () => {
    mocks.thread.mockResolvedValue(undefined);
    vi.useFakeTimers();
    const result = expect(authorizeAgencyRoute(new Request("https://joey.test/eve/v1/session/unknown", { method: "POST", headers: { "x-joey-agent": "agent" } }), { tenantId: "tenant", userId: "user" })).rejects.toThrow("ownership is unavailable");
    await vi.runAllTimersAsync(); await result; vi.useRealTimers();
  });
  it("keeps old/archived sessions cancellable, not writable", async () => {
    mocks.profile.mockResolvedValue({ id: "agent", state: "archived", configVersion: 3 });
    const actor = { tenantId: "tenant", userId: "user" };
    await expect(authorizeAgencyRoute(new Request("https://joey.test/eve/v1/session/private/cancel", { method: "POST" }), actor)).resolves.toMatchObject({ sessionVersion: 2 });
    await expect(authorizeAgencyRoute(new Request("https://joey.test/eve/v1/session/private", { method: "POST" }), actor)).rejects.toThrow("configuration changed");
  });
});
