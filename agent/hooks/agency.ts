import { defineHook } from "eve/hooks";
import { defineState } from "eve/context";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customAgentThreads, eveSessionOwners } from "@/lib/db/schema";
import { registerAgencyThread, requireAgencyMember } from "@/lib/agency/service";
import { agencySessionIdentity } from "../lib/agency-session";
import { userPromptText } from "@/lib/chat-title";

// Waiting means a turn is parked, not that its pending approvals disappeared.
// Keep request identities durable across follow-up turns and reconnects.
const lifecycle = defineState("joey.agency.lifecycle", () => ({
  pendingRequestIds: [] as string[],
  status: "ready",
}));

export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      const identity = agencySessionIdentity(ctx.session);
      const principal = ctx.session.auth.initiator;
      const tenantId = principal?.attributes?.tenantId;
      const userId = principal?.attributes?.userId;
      if (principal?.authenticator === "better-auth" && typeof tenantId === "string" && typeof userId === "string") {
        await requireAgencyMember({ tenantId, userId });
        await db
          .insert(eveSessionOwners)
          .values({
            sessionId: ctx.session.id,
            tenantId,
            userId,
            agentId: identity?.agentId ?? null,
            configVersion: identity?.version ?? null,
          })
          .onConflictDoNothing();
      }
      if (identity && !ctx.session.parent)
        await registerAgencyThread(identity, identity.agentId, identity.version, ctx.session.id);
    },
    async "*"(event, ctx) {
      const identity = agencySessionIdentity(ctx.session);
      if (!identity || ctx.session.parent) return;
      if (event.type === "message.received") {
        const title = userPromptText(event.data.message).slice(0, 120);
        if (title)
          await db
            .update(customAgentThreads)
            .set({ title, updatedAt: new Date() })
            .where(
              and(
                eq(customAgentThreads.sessionId, ctx.session.id),
                eq(customAgentThreads.tenantId, identity.tenantId),
                eq(customAgentThreads.userId, identity.userId),
                eq(customAgentThreads.title, "New conversation")
              )
            );
        return;
      }
      const statuses: Record<string, string> = {
        "turn.started": "working",
        "input.requested": "needs_input",
        "session.waiting": "ready",
        "turn.failed": "failed",
        "session.failed": "failed",
        "turn.cancelled": "cancelled",
      };
      if (event.type === "input.requested") {
        lifecycle.update(state => ({ ...state, pendingRequestIds: [...new Set([
          ...state.pendingRequestIds, ...event.data.requests.map(request => request.requestId),
        ])], status: "needs_input" }));
      } else if (event.type === "input.resolved") {
        const resolved = new Set(event.data.resolutions.map(resolution => resolution.requestId));
        lifecycle.update(state => ({ ...state, pendingRequestIds: state.pendingRequestIds.filter(id => !resolved.has(id)), status: ["failed", "cancelled"].includes(state.status) ? state.status : "working" }));
      } else if (event.type === "session.waiting") {
        lifecycle.update(state => ({ ...state, status: ["failed", "cancelled"].includes(state.status) ? state.status : state.pendingRequestIds.length ? "needs_input" : "ready" }));
      } else {
        const next = statuses[event.type];
        if (!next) return;
        lifecycle.update(state => ({ ...state, status: next }));
      }
      const status = lifecycle.get().status;
      await db
        .update(customAgentThreads)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(customAgentThreads.sessionId, ctx.session.id),
            eq(customAgentThreads.tenantId, identity.tenantId),
            eq(customAgentThreads.userId, identity.userId)
          )
        );
    },
  },
});
