import { defineHook } from "eve/hooks";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customAgentThreads, eveSessionOwners } from "@/lib/db/schema";
import { registerAgencyThread, requireAgencyMember } from "@/lib/agency/service";
import { agencySessionIdentity } from "../lib/agency-session";

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
        const title = event.data.message.replace(/\s+/g, " ").trim().slice(0, 120);
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
      const status = statuses[event.type];
      if (!status) return;
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
