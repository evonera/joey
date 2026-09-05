"use client";

import * as React from "react";
import {
  CheckmarkCircle02Icon as CheckCircleIcon,
  CancelCircleIcon as XCircleIcon,
  Loading03Icon as SpinnerIcon,
  Clock01Icon as ClockIcon,
  ArrowDown01Icon as ChevronDownIcon,
  ListViewIcon as PlanIcon,
} from "hugeicons-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type PlanStepState = "pending" | "in_progress" | "completed" | "failed";

export type PlanStepItem = {
  id: string;
  title: string;
  description?: string;
  status: PlanStepState;
  substeps?: Array<{ id: string; title: string; status: PlanStepState }>;
};

export type PlanProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  steps?: PlanStepItem[];
  defaultOpen?: boolean;
};

export function Plan({
  className,
  title = "Execution Plan",
  steps = [],
  defaultOpen = true,
  children,
  ...props
}: PlanProps) {
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const isRunning = steps.some((s) => s.status === "in_progress");

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("group/plan my-3 rounded-xl border border-border/50 bg-background/60 p-3.5 text-xs shadow-xs space-y-3", className)}
      {...props}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <PlanIcon className="size-4 text-primary" />
          <span>{title}</span>
          {steps.length > 0 ? (
            <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              {completedCount}/{steps.length} completed
            </span>
          ) : null}
        </div>
        <CollapsibleTrigger className="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronDownIcon className="size-3.5 transition-transform duration-200 group-data-[state=open]/plan:rotate-180" />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="space-y-2 pt-1 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {children ??
          steps.map((step, idx) => (
            <PlanStep key={step.id || idx} step={step} index={idx + 1} />
          ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PlanStep({
  step,
  index,
  className,
}: {
  step: PlanStepItem;
  index?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border/30 bg-muted/20 p-2.5 transition-colors",
        step.status === "in_progress" && "border-primary/40 bg-primary/5",
        step.status === "failed" && "border-destructive/40 bg-destructive/5",
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <PlanStepStatus status={step.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            {index ? (
              <span className="text-[11px] text-muted-foreground font-mono">
                {index}.
              </span>
            ) : null}
            <span className="truncate">{step.title}</span>
          </div>
          {step.description ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          ) : null}
        </div>
      </div>

      {step.substeps && step.substeps.length > 0 ? (
        <PlanSubsteps substeps={step.substeps} />
      ) : null}
    </div>
  );
}

export function PlanStepStatus({ status }: { status: PlanStepState }) {
  switch (status) {
    case "completed":
      return (
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
          <CheckCircleIcon className="size-3.5" />
        </span>
      );
    case "in_progress":
      return (
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <SpinnerIcon className="size-3.5 animate-spin" />
        </span>
      );
    case "failed":
      return (
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <XCircleIcon className="size-3.5" />
        </span>
      );
    case "pending":
    default:
      return (
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ClockIcon className="size-3" />
        </span>
      );
  }
}

export function PlanSubsteps({
  substeps,
}: {
  substeps: Array<{ id: string; title: string; status: PlanStepState }>;
}) {
  return (
    <div className="ml-6 mt-1.5 space-y-1 border-l border-border/40 pl-3">
      {substeps.map((sub) => (
        <div key={sub.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <PlanStepStatus status={sub.status} />
          <span className="truncate">{sub.title}</span>
        </div>
      ))}
    </div>
  );
}
