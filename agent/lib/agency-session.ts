import type { SessionContext } from "eve/context";
import { getAgencyProfile } from "@/lib/agency/service";

type Session = SessionContext["session"];
export function agencySessionIdentity(session: Pick<Session, "auth">) {
  const origin = session.auth.initiator?.attributes;
  const current = session.auth.current?.attributes;
  const agentId = origin?.customAgentId ?? current?.customAgentId;
  if (!agentId) return null;
  const tenantId = origin?.tenantId ?? current?.tenantId;
  const userId = origin?.userId ?? current?.userId;
  const version = Number(origin?.customAgentVersion ?? current?.customAgentVersion);
  if (typeof agentId !== "string" || typeof tenantId !== "string" || typeof userId !== "string" || !Number.isSafeInteger(version) || version < 1) throw new Error("Invalid agent session identity.");
  if (current && (current.tenantId !== tenantId || current.customAgentId !== agentId || current.userId !== userId)) throw new Error("Agent session identity cannot change between turns.");
  return { agentId, tenantId, userId, version };
}
export async function agencyProfileForSession(session: Pick<Session, "auth">) {
  const identity = agencySessionIdentity(session);
  if (!identity) return null;
  const agent = await getAgencyProfile(identity, identity.agentId);
  if (agent.configVersion !== identity.version) throw new Error("Agent configuration changed. Start a new conversation.");
  return { ...agent, userId: identity.userId };
}
export function assertGeneralWorkspaceTool(session: Pick<Session, "auth">) {
  if (agencySessionIdentity(session)) throw new Error("This agent is draft-only. Use Joey or the relevant workspace page for automation, account changes, or external actions.");
}
