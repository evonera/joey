import { z } from "zod";

export const agentConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(600).default(""),
  specialty: z.enum(["writer", "researcher", "scout"]).default("writer"),
  avatarShape: z.enum(["orbit", "prism", "ripple"]).default("orbit"),
  avatarColor: z.enum(["teal", "violet", "amber", "blue"]).default("teal"),
  dailyDraftLimit: z.number().int().min(1).max(12).default(3),
  accountIds: z.array(z.string().uuid()).max(15).default([]),
  scoutId: z.string().uuid().nullable().default(null),
  themePageId: z.string().uuid().nullable().default(null),
}).strict().superRefine((config, ctx) => {
  if (new Set(config.accountIds).size !== config.accountIds.length) {
    ctx.addIssue({ code: "custom", path: ["accountIds"], message: "Choose each account only once." });
  }
  if (config.scoutId && (!config.themePageId || !config.accountIds.length)) {
    ctx.addIssue({ code: "custom", path: ["scoutId"], message: "Scout automation needs a Theme Page and destination account." });
  }
});
export type AgencyConfig = z.infer<typeof agentConfigSchema>;
export type AgencyActor = { tenantId: string; userId: string };
export function canOperateAgency(role: string) { return role === "owner" || role === "admin"; }

export function assertAgentSessionAccess(input: {
  actor: AgencyActor;
  agentId: string;
  agentVersion: number;
  agentState: string;
  thread: { tenantId: string; userId: string; agentId: string; configVersion: number };
  write: boolean;
}) {
  if (input.thread.tenantId !== input.actor.tenantId || input.thread.userId !== input.actor.userId || input.thread.agentId !== input.agentId) {
    throw new Error("Conversation not found.");
  }
  // Old conversations remain readable/cancellable, but must never execute a
  // changed or archived configuration. Start a new conversation instead.
  if (input.write && (input.thread.configVersion !== input.agentVersion || input.agentState === "archived")) {
    throw new Error("Agent configuration changed. Start a new conversation.");
  }
}
