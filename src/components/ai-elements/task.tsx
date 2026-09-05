"use client";

import * as React from "react";
import {
  Loading03Icon as SpinnerIcon,
  CheckmarkCircle02Icon as CheckCircleIcon,
  CancelCircleIcon as XCircleIcon,
  Task01Icon as TaskIcon,
  ArrowRight01Icon as ArrowIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TaskStatus = "idle" | "running" | "completed" | "failed";

export type TaskProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string;
  status: TaskStatus;
  progress?: number;
  currentAction?: string;
  onCancel?: () => void;
  onRetry?: () => void;
};

export function Task({
  title,
  status,
  progress,
  currentAction,
  onCancel,
  onRetry,
  className,
  children,
  ...props
}: TaskProps) {
  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  return (
    <div
      className={cn(
        "my-3 flex flex-col gap-2.5 rounded-xl border p-3.5 text-xs transition-all shadow-xs",
        isRunning
          ? "border-primary/40 bg-primary/5"
          : isCompleted
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isFailed
          ? "border-destructive/40 bg-destructive/5"
          : "border-border/50 bg-background/60",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <TaskStatusIcon status={status} />
          <span className="font-semibold text-foreground truncate text-sm">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isRunning && onCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive cursor-pointer"
            >
              Cancel
            </Button>
          ) : null}
          {isFailed && onRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-6 px-2 text-[11px] cursor-pointer"
            >
              Retry
            </Button>
          ) : null}
        </div>
      </div>

      {typeof progress === "number" ? (
        <TaskProgress progress={progress} status={status} />
      ) : null}

      {currentAction ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ArrowIcon className="size-3 text-primary shrink-0" />
          <span className="truncate">{currentAction}</span>
        </div>
      ) : null}

      {children}
    </div>
  );
}

export function TaskStatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case "running":
      return (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <SpinnerIcon className="size-3.5 animate-spin" />
        </span>
      );
    case "completed":
      return (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
          <CheckCircleIcon className="size-3.5" />
        </span>
      );
    case "failed":
      return (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <XCircleIcon className="size-3.5" />
        </span>
      );
    case "idle":
    default:
      return (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <TaskIcon className="size-3.5" />
        </span>
      );
  }
}

export function TaskProgress({
  progress,
  status,
  className,
}: {
  progress: number;
  status: TaskStatus;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, progress));
  const tone =
    status === "completed"
      ? "bg-emerald-500"
      : status === "failed"
      ? "bg-destructive"
      : "bg-primary";

  return (
    <div className={cn("flex items-center gap-2 w-full", className)}>
      <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn("h-full transition-all duration-300 rounded-full", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
        {Math.round(pct)}%
      </span>
    </div>
  );
}
