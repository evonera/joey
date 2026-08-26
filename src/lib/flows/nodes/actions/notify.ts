import { defineNode } from "../../node-contract";
import { notifyConfig } from "../../catalog";


const configSchema = notifyConfig;

export const notifyNode = defineNode({
  type: "action.notify",
  category: "action",
  label: "Notify me",
  description: "Sends you an in-app notification (and email if your preferences allow).",
  inputs: ["data"],
  outputs: ["data"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);

    const body = config.messageTemplate?.includes("{{input}}")
      ? config.messageTemplate.replaceAll("{{input}}", safeStringify(input))
      : (config.messageTemplate ?? safeStringify(input)).slice(0, 500);

    if (ctx.signal?.aborted) {
      throw (ctx.signal.reason as Error) ?? new Error("Aborted");
    }

    const { db } = await import("@/lib/db");
    const { flowRuns, notifications, notificationPreferences, tenants, member, user } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");

    // Atomically check active run status and insert in-app notification in the same transaction
    const emailRecipient = await db.transaction(async (tx) => {
      if (ctx.runId) {
        const [lockedRun] = await tx
          .select({ id: flowRuns.id })
          .from(flowRuns)
          .where(and(eq(flowRuns.id, ctx.runId), eq(flowRuns.status, "running")))
          .for("update");
        if (!lockedRun) {
          throw new Error("Execution fenced: flow run is no longer running.");
        }
      }

      let prefs = await tx.query.notificationPreferences.findFirst({
        where: eq(notificationPreferences.tenantId, ctx.tenantId),
      });

      if (!prefs) {
        const tenant = await tx.query.tenants.findFirst({
          where: eq(tenants.id, ctx.tenantId),
        });
        if (tenant) {
          const membership = await tx.query.member.findFirst({
            where: eq(member.organizationId, ctx.tenantId),
          });
          const owner = membership
            ? await tx.query.user.findFirst({ where: eq(user.id, membership.userId) })
            : null;
          const [newPrefs] = await tx
            .insert(notificationPreferences)
            .values({ tenantId: ctx.tenantId, emailAddress: owner?.email || null })
            .returning();
          prefs = newPrefs;
        }
      }

      const shouldCreateInApp = prefs ? prefs.inAppDraftReady : true;
      if (shouldCreateInApp) {
        await tx.insert(notifications).values({
          tenantId: ctx.tenantId,
          type: "draft_ready",
          title: config.title,
          body,
          link: `/flows/runs?runId=${ctx.runId}`,
          metadata: { flowRunId: ctx.runId },
        });
      }

      const shouldSendEmail = prefs ? prefs.emailDraftReady : false;
      return shouldSendEmail && prefs?.emailAddress ? prefs.emailAddress : null;
    });

    if (emailRecipient && !ctx.signal?.aborted) {
      if (ctx.runId) {
        const [stillRunning] = await db
          .select({ id: flowRuns.id })
          .from(flowRuns)
          .where(and(eq(flowRuns.id, ctx.runId), eq(flowRuns.status, "running")));
        if (!stillRunning) {
          throw new Error("Execution fenced: flow run is no longer running.");
        }
      }
      const { sendNotificationEmail } = await import("@/lib/email");
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const fullLink = `${appUrl}/flows/runs?runId=${ctx.runId}`;
      await sendNotificationEmail({
        to: emailRecipient,
        subject: config.title,
        body,
        tenantId: ctx.tenantId,
        link: fullLink,
      }).catch((err) => {
        console.warn("Notification email delivery failed:", err);
      });
    }

    return { output: input };
  },
});

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
