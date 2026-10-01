import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { pendingRequestIds: [] as string[], status: "ready" },
  write: vi.fn(),
}));
vi.mock("eve/context", () => ({ defineState: () => ({
  get: () => mocks.state,
  update: (update: (state: typeof mocks.state) => typeof mocks.state) => { mocks.state = update(mocks.state); },
}) }));
vi.mock("eve/hooks", () => ({ defineHook: (hook: unknown) => hook }));
vi.mock("@/lib/db", () => ({ db: { update: () => ({ set: (values: unknown) => { mocks.write(values); return { where: vi.fn() }; } }) } }));
vi.mock("@/lib/agency/service", () => ({ registerAgencyThread: vi.fn(), requireAgencyMember: vi.fn() }));
import hook from "../../hooks/agency";

const attributes = { tenantId: "tenant", userId: "owner", customAgentId: "agent", customAgentVersion: "1" };
const context = { session: { id: "session", auth: { current: { attributes }, initiator: { attributes } } } };
async function event(type: string, data: unknown = {}) {
  await hook.events!["*"]!({ type, data } as never, context as never);
  return mocks.write.mock.lastCall?.[0].status;
}
beforeEach(() => { mocks.state = { pendingRequestIds: [], status: "ready" }; mocks.write.mockReset(); });

describe("Agency durable lifecycle projection", () => {
  it("keeps an approval visible when the session parks and a follow-up turn completes", async () => {
    await event("input.requested", { requests: [{ requestId: "approval" }] });
    expect(await event("session.waiting")).toBe("needs_input");
    await event("turn.started");
    expect(await event("session.waiting")).toBe("needs_input");
    await event("input.resolved", { resolutions: [{ requestId: "approval" }] });
    expect(await event("session.waiting")).toBe("ready");
  });
  it("resolves request IDs independently across multiple pending batches", async () => {
    await event("input.requested", { requests: [{ requestId: "a" }, { requestId: "b" }] });
    await event("input.resolved", { resolutions: [{ requestId: "a" }] });
    expect(await event("session.waiting")).toBe("needs_input");
    await event("input.resolved", { resolutions: [{ requestId: "b" }] });
    expect(await event("session.waiting")).toBe("ready");
  });
  it.each(["failed", "cancelled"])("preserves %s until the next turn starts", async status => {
    await event(`turn.${status}`);
    expect(await event("session.waiting")).toBe(status);
    expect(await event("turn.started")).toBe("working");
    expect(await event("session.waiting")).toBe("ready");
  });
});
