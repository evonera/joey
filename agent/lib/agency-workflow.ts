/// <reference types="eve/workflow-modules" />
import { start } from "workflow/api";
import { agencyDispatchPage, executeAgencyDraft } from "@/lib/agency/automation";
import type { AgencyActor } from "@/lib/agency/config";
import type { SessionContext } from "eve/context";

export async function agencyDraftWorkflow(actor: AgencyActor, agentId: string, version: number, day: string) {
  "use workflow";
  return draftStep(actor, agentId, version, undefined, day);
}
export async function draftStep(actor: AgencyActor, agentId: string, version: number, signal?: AbortSignal, day?: string) {
  "use step";
  return executeAgencyDraft(actor, agentId, version, signal, day);
}
// Never implicitly repeat paid requests. Explicit retries use the same DB
// receipt, three-attempt ceiling and existing saved package.
draftStep.maxRetries = 0;
export async function conversationDraftStep(session: SessionContext["session"], signal: AbortSignal) {
  "use step";
  const { agencySessionIdentity } = await import("./agency-session");
  const identity = agencySessionIdentity(session);
  if (!identity) throw new Error("Use this tool inside its custom agent conversation.");
  return executeAgencyDraft(
    { tenantId: identity.tenantId, userId: identity.userId },
    identity.agentId,
    identity.version,
    signal
  );
}
conversationDraftStep.maxRetries = 0;

export async function agencyDispatchWorkflow(day: string) {
  "use workflow";
  let cursor = "";
  for (let batch = 0; batch < 100; batch++) {
    const next = await dispatchStep(cursor, day);
    if (!next) return;
    cursor = next;
  }
  await capacityWarning();
}
async function dispatchStep(cursor: string, day: string) {
  "use step";
  const rows = await agencyDispatchPage(cursor, day);
  for (const row of rows) {
    if (!row.userId) continue;
    await start(agencyDraftWorkflow, [{ tenantId: row.tenantId, userId: row.userId }, row.id, row.version, day]);
  }
  return rows.length === 25 ? rows.at(-1)!.id : null;
}
async function capacityWarning() {
  "use step";
  console.error(
    "[agency] Dispatch safety ceiling reached (2500 agents). Raise capacity deliberately before enabling more agents."
  );
}
