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
    const { eq, and, sql } = await import("drizzle-orm");

    let prefs = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.tenantId, ctx.tenantId),
    });

    if (!prefs) {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, ctx.tenantId),
      });
      if (tenant) {
        const membership = await db.query.member.findFirst({
          where: eq(member.organizationId, ctx.tenantId),
        });
        const owner = membership
          ? await db.query.user.findFirst({ where: eq(user.id, membership.userId) })
          : null;
        const [newPrefs] = await db
          .insert(notificationPreferences)
          .values({ tenantId: ctx.tenantId, emailAddress: owner?.email || null })
          .returning();
        prefs = newPrefs;
      }
    }

    const shouldSendEmail = prefs ? prefs.emailDraftReady : false;
    const emailRecipient = shouldSendEmail && prefs?.emailAddress ? prefs.emailAddress : null;

    if (ctx.runId && ctx.nodeId) {
      const itemKey = ctx.itemKey ?? "root";
      const existing = await db.query.notifications.findFirst({
        where: and(
          eq(notifications.tenantId, ctx.tenantId),
          sql`${notifications.metadata}->>'flowRunId' = ${ctx.runId}`,
          sql`${notifications.metadata}->>'nodeId' = ${ctx.nodeId}`,
          sql`${notifications.metadata}->>'itemKey' = ${itemKey}`,
        ),
      });
      if (existing) {
        if (!emailRecipient || (existing.metadata as Record<string, unknown>)?.emailSent) {
          return { output: input };
        }
      }
    }

    if (ctx.runId) {
      const [stillRunning] = await db
        .select({ id: flowRuns.id })
        .from(flowRuns)
        .where(and(eq(flowRuns.id, ctx.runId), eq(flowRuns.status, "running")));
      if (!stillRunning || ctx.signal?.aborted) {
        throw (ctx.signal?.reason as Error) ?? new Error("Execution fenced: flow run is no longer running.");
      }
    }

    if (emailRecipient && !ctx.signal?.aborted) {
      const { sendNotificationEmail } = await import("@/lib/email");
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const fullLink = `${appUrl}/flows/runs?runId=${ctx.runId}`;
      await sendNotificationEmail({
        to: emailRecipient,
        subject: config.title,
        body,
        tenantId: ctx.tenantId,
        link: fullLink,
      });
    }

    await db.transaction(async (tx) => {
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

      const shouldCreateInApp = prefs ? prefs.inAppDraftReady : true;
      if (shouldCreateInApp) {
        await tx.insert(notifications).values({
          tenantId: ctx.tenantId,
          type: "draft_ready",
          title: config.title,
          body,
          link: `/flows/runs?runId=${ctx.runId}`,
          metadata: {
            flowRunId: ctx.runId,
            nodeId: ctx.nodeId,
            itemKey: ctx.itemKey ?? "root",
            emailSent: Boolean(emailRecipient),
          },
        });
      }
    });

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
