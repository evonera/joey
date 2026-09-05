"use client";

import * as React from "react";
import {
  SquareLock02Icon as SandboxIcon,
  RefreshIcon,
  PlayIcon,
  StopIcon,
  Loading03Icon as SpinnerIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SandboxStatus = "idle" | "running" | "stopped" | "error";

export type SandboxProps = React.HTMLAttributes<HTMLDivElement> & {
  name?: string;
  status?: SandboxStatus;
  memoryMb?: number;
  maxMemoryMb?: number;
  onRestart?: () => void;
  onStop?: () => void;
};

export function Sandbox({
  name = "Eve Sandbox",
  status = "idle",
  memoryMb,
  maxMemoryMb = 512,
  onRestart,
  onStop,
  className,
  children,
  ...props
}: SandboxProps) {
  const isRunning = status === "running";

  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-border/60 bg-background/80 overflow-hidden text-xs shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <SandboxIcon className="size-3.5 text-primary shrink-0" />
          <span className="font-semibold text-foreground truncate">{name}</span>
          <SandboxStatusPill status={status} />
        </div>

        <div className="flex items-center gap-2">
          {typeof memoryMb === "number" ? (
            <span className="text-[10px] font-mono text-muted-foreground">
              {memoryMb}MB / {maxMemoryMb}MB
            </span>
          ) : null}

          {onRestart ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRestart}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Restart sandbox"
            >
              <RefreshIcon className="size-3" />
            </Button>
          ) : null}

          {isRunning && onStop ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onStop}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
              title="Stop sandbox"
            >
              <StopIcon className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="p-3 bg-muted/10 font-mono text-[11px] min-h-[80px]">
        {children ?? (
          <div className="flex items-center justify-center h-20 text-muted-foreground/60 text-xs">
            Sandbox environment ready
          </div>
        )}
      </div>
    </div>
  );
}

export function SandboxStatusPill({ status }: { status: SandboxStatus }) {
  switch (status) {
    case "running":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-medium text-emerald-500">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Running
        </span>
      );
    case "stopped":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.2 text-[10px] font-medium text-muted-foreground">
          Stopped
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.2 text-[10px] font-medium text-destructive">
          Error
        </span>
      );
    case "idle":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.2 text-[10px] font-medium text-muted-foreground">
          Idle
        </span>
      );
  }
}
