"use client";

import * as React from "react";
import {
  SparklesIcon,
  Settings02Icon as SettingsIcon,
  CheckmarkCircle02Icon as CheckCircleIcon,
  CancelCircleIcon as XCircleIcon,
  Loading03Icon as SpinnerIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkflowNodeStatus = "idle" | "running" | "completed" | "error";

export type WorkflowNodeProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  status?: WorkflowNodeStatus;
  isSelected?: boolean;
  onOpenSettings?: () => void;
  hasInputHandle?: boolean;
  hasOutputHandle?: boolean;
};

export function WorkflowNode({
  title,
  subtitle,
  icon,
  status = "idle",
  isSelected = false,
  onOpenSettings,
  hasInputHandle = true,
  hasOutputHandle = true,
  className,
  children,
  ...props
}: WorkflowNodeProps) {
  const isRunning = status === "running";

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border border-border/60 bg-background/90 min-w-[200px] max-w-[260px] text-xs shadow-md transition-all select-none",
        isSelected && "ring-2 ring-primary border-primary",
        isRunning && "border-primary/50 shadow-primary/10 shadow-lg",
        className
      )}
      {...props}
    >
      {/* Input Handle */}
      {hasInputHandle ? (
        <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 size-3 rounded-full border-2 border-background bg-muted-foreground/60 hover:bg-primary transition-colors cursor-crosshair" />
      ) : null}

      {/* Output Handle */}
      {hasOutputHandle ? (
        <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 size-3 rounded-full border-2 border-background bg-muted-foreground/60 hover:bg-primary transition-colors cursor-crosshair" />
      ) : null}

      <div className="flex items-center justify-between border-b border-border/30 px-3 py-2 bg-muted/20 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-5 shrink-0 items-center justify-center text-primary">
            {icon ?? <SparklesIcon className="size-3.5" />}
          </span>
          <span className="font-semibold text-foreground truncate text-xs">{title}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <WorkflowNodeStatusIcon status={status} />
          {onOpenSettings ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenSettings}
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Configure step"
            >
              <SettingsIcon className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="p-3 space-y-1.5">
        {subtitle ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function WorkflowNodeStatusIcon({ status }: { status: WorkflowNodeStatus }) {
  switch (status) {
    case "running":
      return <SpinnerIcon className="size-3 animate-spin text-primary shrink-0" />;
    case "completed":
      return <CheckCircleIcon className="size-3 text-emerald-500 shrink-0" />;
    case "error":
      return <XCircleIcon className="size-3 text-destructive shrink-0" />;
    case "idle":
    default:
      return null;
  }
}
