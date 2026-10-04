import type { AgencyConfig } from "@/lib/agency/config";

export interface AgencyAgent {
  id: string;
  name: string;
  description: string;
  specialty: string;
  avatarShape: string;
  avatarColor: string;
  state: string;
  configVersion: number;
  dailyDraftLimit: number;
  accountIds: string[];
  scoutId: string | null;
  themePageId: string | null;
}
export interface AgencyChoices {
  accounts: Array<{ id: string; platform: string; accountName: string | null }>;
  pages: Array<{ id: string; name: string }>;
  scouts: Array<{ id: string; name: string }>;
}
export function configFromAgent(agent: AgencyAgent): AgencyConfig {
  // These values are validated again by the server; the client never chooses
  // an executable prompt, runtime, permission mode, or publication action.
  return {
    name: agent.name,
    description: agent.description,
    specialty: agent.specialty === "scout" ? "scout" : agent.specialty === "researcher" ? "researcher" : "writer",
    avatarShape: agent.avatarShape === "prism" ? "prism" : agent.avatarShape === "ripple" ? "ripple" : "orbit",
    avatarColor:
      agent.avatarColor === "violet"
        ? "violet"
        : agent.avatarColor === "amber"
          ? "amber"
          : agent.avatarColor === "blue"
            ? "blue"
            : "teal",
    accountIds: agent.accountIds,
    scoutId: agent.scoutId,
    themePageId: agent.themePageId,
    dailyDraftLimit: agent.dailyDraftLimit,
  };
}
