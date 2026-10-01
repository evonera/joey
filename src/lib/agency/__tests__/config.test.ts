import { describe, expect, it } from "vitest";
import { agentConfigSchema, assertAgentSessionAccess, canOperateAgency } from "../config";
describe("Agency configuration policy", () => {
  it("bounds identities and rejects arbitrary runtime/bypass configuration", () => {
    expect(agentConfigSchema.parse({ name: "Writer" })).toMatchObject({ dailyDraftLimit: 3, accountIds: [], specialty: "writer" });
    for (const input of [{ name: "A", bypassAll: true }, { name: "A", dailyDraftLimit: 13 }, { name: "A", avatarShape: "boardui" }, { name: "A", systemPrompt: "Publish anything" }]) expect(agentConfigSchema.safeParse(input).success).toBe(false);
  });
  it("requires a Theme Page and accounts for Scout automation", () => {
    expect(agentConfigSchema.safeParse({ name: "Scout", scoutId: crypto.randomUUID() }).success).toBe(false);
  });
  it("does not let members operate automation", () => {
    expect(canOperateAgency("member")).toBe(false); expect(canOperateAgency("owner")).toBe(true); expect(canOperateAgency("admin")).toBe(true);
  });
  const input = { actor: { tenantId: "tenant", userId: "user" }, agentId: "agent", agentVersion: 2, agentState: "paused", thread: { tenantId: "tenant", userId: "user", agentId: "agent", configVersion: 1 }, write: false };
  it("separates tenants, users and agents", () => {
    for (const thread of [{ ...input.thread, tenantId: "other" }, { ...input.thread, userId: "other" }, { ...input.thread, agentId: "other" }]) expect(() => assertAgentSessionAccess({ ...input, thread })).toThrow("Conversation not found");
  });
  it("allows reading old history but refuses stale/archived writes", () => {
    expect(() => assertAgentSessionAccess(input)).not.toThrow();
    expect(() => assertAgentSessionAccess({ ...input, write: true })).toThrow("configuration changed");
    expect(() => assertAgentSessionAccess({ ...input, agentState: "archived", thread: { ...input.thread, configVersion: 2 }, write: true })).toThrow("configuration changed");
  });
});
