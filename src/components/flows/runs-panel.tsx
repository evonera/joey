"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckmarkCircle02Icon as CheckCircle2, CancelCircleIcon as XCircle, RefreshIcon as RotateCcw, Clock01Icon as Clock3, Cancel01Icon } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listRuns, resumeRun, restartRun } from "@/app/actions/flows";
import type { FlowRunRow } from "@/app/actions/flows";
import type { FlowStep } from "@/lib/flows/types";

const STATUS_STYLE: Record<string, string> = {
  succeeded: "text-emerald-600",
  failed: "text-red-500",
  working: "text-indigo-500",
  waiting_approval: "text-amber-500",
  skipped: "text-zinc-400",
  ready: "text-muted-foreground",
};

export function RunsPanel({
  open, onClose, flowId,
}: {
  open: boolean; onClose: () => void; flowId: string;
}) {
  const [runs, setRuns] = useState<FlowRunRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<FlowRunRow | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!open) return;
    const res = await listRuns(flowId);
    setRuns(res.runs);
    setSelectedRun((prev) => (prev ? res.runs.find((r) => r.id === prev.id) ?? res.runs[0] ?? null : res.runs[0] ?? null));
  }, [open, flowId]);

  useEffect(() => { void load(); }, [load]);

  async function handleResume(approve: boolean) {
    if (!selectedRun) return;
    const res = await resumeRun(selectedRun.id, approve);
    if (res.error) toast.error(res.error);
    else toast.success(approve ? "Approved — run resumed" : "Rejected");
    await load();
  }

  async function handleRestart() {
    if (!selectedRun) return;
    const res = await restartRun(selectedRun.id);
    if (res.runId) toast.success("Re-run started");
    else toast.error(res.error ?? "Failed");
    await load();
  }

  if (!open) return null;

  const steps = ((selectedRun?.steps as unknown[]) ?? []) as FlowStep[];
  const canDecide = selectedRun?.status === "waiting_approval";
  const canRestart = selectedRun && ["failed", "succeeded"].includes(selectedRun.status);

  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-[26rem] max-w-full overflow-y-auto border-l bg-background p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Runs</p>
          <button className="text-xs text-muted-foreground hover:text-foreground p-1" onClick={onClose}><Cancel01Icon size={14} /></button>
        </div>

        <div className="space-y-1">
          {runs.length === 0 && <p className="text-xs text-muted-foreground py-2">No runs yet. Hit “Test run”.</p>}
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => { setSelectedRun(run); setExpandedStep(null); }}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                selectedRun?.id === run.id ? "border-indigo-400 bg-accent" : "hover:bg-accent"
              }`}
            >
              <Badge variant={run.status === "succeeded" ? "default" : run.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                {run.status}
              </Badge>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                {new Date(run.startedAt).toLocaleTimeString()}
              </span>
              <span className="ml-auto text-[10px] uppercase text-muted-foreground">{run.trigger}</span>
            </button>
          ))}
        </div>

        {canDecide && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs font-medium">Waiting for your approval at a gate.</p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => handleResume(true)}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleResume(false)}>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          </div>
        )}

        {canRestart && (
          <Button size="sm" variant="outline" className="w-full" onClick={handleRestart}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Re-run reusing successful steps
          </Button>
        )}

        {selectedRun && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Steps</p>
            {steps.map((step) => (
              <div key={step.nodeId} className="rounded-lg border">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                  onClick={() => setExpandedStep(expandedStep === step.nodeId + step.status ? null : step.nodeId + step.status)}
                >
                  <span className={`font-mono font-semibold ${STATUS_STYLE[step.status] ?? ""}`}>{step.status}</span>
                  <span>{step.type}</span>
                  {step.cached ? <Badge variant="secondary" className="ml-auto text-[9px]">cached</Badge> : null}
                </button>
                {expandedStep === step.nodeId + step.status && (
                  <div className="border-t px-3 py-2 space-y-2 text-[11px]">
                    {step.error && <p className="font-mono text-red-500">{step.error}</p>}
                    {"output" in step && step.output !== undefined && (
                      <JsonBlock label="output" value={step.output} />
                    )}
                    {"input" in step && step.input !== undefined && (
                      <JsonBlock label="input" value={step.input} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-0.5 font-semibold text-muted-foreground">{label}</p>
      <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono leading-snug">
        {JSON.stringify(value, null, 2)?.slice(0, 2000)}
      </pre>
    </div>
  );
}
