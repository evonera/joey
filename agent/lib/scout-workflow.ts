/// <reference types="eve/workflow-modules" />
import { start } from "workflow/api";
import { evaluateScout } from "@/lib/scouts/evaluator";
import { deferScoutEvaluationDispatch } from "@/lib/scouts/scheduler";
import type { ScoutDispatchJob } from "@/lib/scouts/scheduler";

export type ScoutWorkflowJob = ScoutDispatchJob;
export async function startScoutBatch(jobs: ScoutWorkflowJob[]) {
  "use step";
  return start(scoutBatchWorkflow, [jobs]);
}
export async function scoutBatchWorkflow(jobs: ScoutWorkflowJob[]) {
  "use workflow";
  const results = [];
  for (let offset = 0; offset < jobs.length; offset += 2) {
    results.push(...await Promise.all(jobs.slice(offset, offset + 2).map((job) => scoutEvaluationStep(job))));
  }
  return results;
}
export async function scoutEvaluationStep(job: ScoutWorkflowJob) {
  "use step";
  try {
    const result = await evaluateScout(job.scoutId, { tenantId: job.tenantId, evaluationId: job.evaluationId, requireActive: true });
    if (result.pending) await deferScoutEvaluationDispatch(job);
    return result;
  } catch {
    return { triggered: false, itemsFound: 0, evaluationId: job.evaluationId, error: "Scout evaluation stopped before a new phase." };
  }
}
// Workflow replay must never repeat an ambiguous collection or judge call.
scoutEvaluationStep.maxRetries = 0;
