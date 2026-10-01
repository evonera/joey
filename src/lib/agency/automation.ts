import { db } from "@/lib/db";
import { customAgents, customAgentRuns, member } from "@/lib/db/schema";
import { and, eq, gt, asc, sql } from "drizzle-orm";
import { resolveToken } from "@/lib/flows/nodes/data/apify-actor";
import { resolveExaKey } from "@/lib/search/exa-client";
import { resolveModelForTurn } from "@/lib/agent-model-resolver";
import { evaluateScout, type ScoutAlert, type EvaluateScoutResult } from "@/lib/scouts/evaluator";
import { remixScoutAlertToThemeStudio } from "@/lib/scouts/remix-pipeline";
import {
  assertAgencyRunCurrent,
  attachAgencyDraft,
  finishAgencyRun,
  getAgencyProfile,
  reserveAgencyRun,
} from "./service";
import type { AgencyActor } from "./config";

export function agencyDailyEventKey(now = new Date()) {
  return `daily:${now.toISOString().slice(0, 10)}`;
}
export function requireAgencyAutomationEnabled() {
  if (process.env.AGENCY_AUTOMATION_ENABLED !== "true")
    throw new Error("Agency automation is disabled by the operator. Chat and manual drafts remain available.");
}

export async function preflightAgencyAutomation(actor: AgencyActor, agentId: string) {
  requireAgencyAutomationEnabled();
  const agent = await getAgencyProfile(actor, agentId);
  if (!agent.scoutId || !agent.themePageId || !agent.accountIds.length)
    throw new Error("Choose an Instagram Scout, Theme Page and destinations first.");
  // Resolve/check only; never return credentials or SDK model objects to UI.
  await resolveToken(actor.tenantId);
  await resolveExaKey(actor.tenantId);
  await resolveModelForTurn({ preferredModel: "google/gemini-3.8-flash", tenantId: actor.tenantId });
}

export async function executeAgencyDraft(actor: AgencyActor, agentId: string, version: number, signal?: AbortSignal) {
  requireAgencyAutomationEnabled();
  signal?.throwIfAborted();
  const claim = await reserveAgencyRun(actor, agentId, version, agencyDailyEventKey());
  if (!claim.claimed)
    return { status: claim.run.status, runId: claim.run.id, packageId: claim.run.packageId, duplicate: true };
  const run = claim.run;
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(285_000)]) : AbortSignal.timeout(285_000);
  const guard = async () => {
    deadline.throwIfAborted();
    requireAgencyAutomationEnabled();
    await assertAgencyRunCurrent(run);
  };
  try {
    await guard();
    await preflightAgencyAutomation(actor, agentId);
    const { config } = await assertAgencyRunCurrent(run);
    const captured = run.sourceAlert as ScoutAlert | null;
    const evaluation: EvaluateScoutResult = captured
      ? { triggered: true, alert: captured, itemsFound: 0 }
      : await evaluateScout(config.scoutId!, {
          tenantId: actor.tenantId,
          force: true,
          signal: deadline,
          beforePaidPhase: guard,
        });
    if (evaluation.error) throw new Error(evaluation.error);
    await guard();
    if (!evaluation.triggered || !evaluation.alert) {
      const accepted = await finishAgencyRun(run, "completed");
      return { status: accepted ? "completed" : "cancelled", runId: run.id, noChange: true };
    }
    if (!captured)
      await db.transaction(async (tx) => {
        await assertAgencyRunCurrent(run, tx);
        await tx
          .update(customAgentRuns)
          .set({ sourceAlert: evaluation.alert, updatedAt: new Date() })
          .where(
            and(
              eq(customAgentRuns.id, run.id),
              eq(customAgentRuns.tenantId, run.tenantId),
              eq(customAgentRuns.leaseToken, run.leaseToken),
              eq(customAgentRuns.status, "running")
            )
          );
      });
    const draft = await remixScoutAlertToThemeStudio({
      tenantId: actor.tenantId,
      scoutId: config.scoutId!,
      themePageId: config.themePageId!,
      alert: evaluation.alert,
      signal: deadline,
      governance: {
        agentId,
        configVersion: version,
        accountIds: config.accountIds,
        runId: run.id,
        beforePhase: guard,
        beforeCommit: async (tx) => {
          deadline.throwIfAborted();
          requireAgencyAutomationEnabled();
          await assertAgencyRunCurrent(run, tx);
        },
        afterCommit: (tx, packageId) => attachAgencyDraft(tx, run, packageId),
      },
    });
    const status =
      draft.success && draft.packageId
        ? draft.renderState === "queued" || draft.renderState === "processing"
          ? "queued"
          : "completed"
        : "failed";
    const accepted = await finishAgencyRun(run, status, {
      packageId: draft.packageId,
      error: draft.success
        ? undefined
        : "Draft preparation failed. Review run setup and the existing draft before retrying.",
    });
    return { status: accepted ? status : "cancelled", runId: run.id, packageId: draft.packageId, reviewRequired: true };
  } catch {
    const accepted = await finishAgencyRun(run, "failed", {
      error: deadline.aborted
        ? "Run cancelled or timed out; no new phase will start."
        : "Run stopped. Check activation, provider credentials and workspace AI budget before retrying.",
    });
    return { status: accepted ? "failed" : "cancelled", runId: run.id };
  }
}

// Bounded/keyset scheduling; no model is used to route a scheduled run.
export async function agencyDispatchPage(cursor: string, day: string) {
  if (process.env.AGENCY_AUTOMATION_ENABLED !== "true") return [];
  return db
    .select({
      id: customAgents.id,
      tenantId: customAgents.tenantId,
      userId: customAgents.approvedBy,
      version: customAgents.configVersion,
    })
    .from(customAgents)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, customAgents.tenantId),
        eq(member.userId, customAgents.approvedBy),
        sql`${member.role} IN ('owner', 'admin')`
      )
    )
    .where(
      and(
        gt(customAgents.id, cursor),
        eq(customAgents.state, "active"),
        eq(customAgents.approvedVersion, customAgents.configVersion),
        sql`NOT EXISTS (SELECT 1 FROM ${customAgentRuns} WHERE ${customAgentRuns.tenantId} = ${customAgents.tenantId} AND ${customAgentRuns.agentId} = ${customAgents.id} AND ${customAgentRuns.eventKey} = ${`daily:${day}`})`
      )
    )
    .orderBy(asc(customAgents.id))
    .limit(25);
}
