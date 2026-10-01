import { defineTool } from "eve/tools";
import { z } from "zod";
import { agencySessionIdentity } from "../lib/agency-session";
import { conversationDraftStep } from "../lib/agency-workflow";
import { getAgencyProfile, requireAgencyMember } from "@/lib/agency/service";
import { canOperateAgency } from "@/lib/agency/config";
import { requireAgencyAutomationEnabled } from "@/lib/agency/automation";

export default defineTool({
  description:
    "Run this agent's approved daily Instagram Scout → research → Theme Studio draft check. Draft-only; never approve, schedule or publish. Requires a fresh workspace owner/admin confirmation; daily replay reuses its receipt.",
  inputSchema: z.object({}).strict(),
  approval: {
    async request(ctx) {
      try {
        requireAgencyAutomationEnabled();
        const identity = agencySessionIdentity(ctx.session);
        if (!identity || !canOperateAgency((await requireAgencyMember(identity)).role))
          throw new Error("An owner/admin agent conversation is required.");
        const profile = await getAgencyProfile(identity, identity.agentId);
        if (
          profile.state !== "active" ||
          profile.approvedVersion !== identity.version ||
          profile.configVersion !== identity.version
        )
          throw new Error("Activate the current configuration in Agents first.");
        return "user-approval";
      } catch {
        return {
          type: "denied",
          reason: "Only a current workspace owner/admin can run an explicitly activated agent.",
        };
      }
    },
    async response(ctx) {
      try {
        const origin = ctx.session.initiator?.attributes;
        const current = ctx.responder.attributes;
        if (
          ctx.responder.authenticator !== "better-auth" ||
          ctx.responder.principalType !== "user" ||
          !origin?.customAgentId ||
          current?.tenantId !== origin.tenantId ||
          current?.userId !== origin.userId ||
          current?.customAgentId !== origin.customAgentId
        )
          throw new Error("Wrong approver.");
        const actor = { tenantId: String(origin.tenantId), userId: String(origin.userId) };
        const profile = await getAgencyProfile(actor, String(origin.customAgentId));
        if (
          !canOperateAgency((await requireAgencyMember(actor)).role) ||
          profile.state !== "active" ||
          profile.configVersion !== Number(origin.customAgentVersion) ||
          profile.approvedVersion !== profile.configVersion
        )
          throw new Error("Activation changed.");
        requireAgencyAutomationEnabled();
        return { status: "allowed" };
      } catch {
        return { status: "rejected", reason: "The owner/admin or activation permission is no longer valid." };
      }
    },
  },
  async execute(_input, ctx) {
    "use workflow";
    return conversationDraftStep(ctx.session, ctx.abortSignal);
  },
});
