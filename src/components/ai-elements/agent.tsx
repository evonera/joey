"use client";

import * as React from "react";
import {
  BotIcon,
  SparklesIcon,
  Loading03Icon as SpinnerIcon,
  CheckmarkCircle02Icon as CheckCircleIcon,
  ArrowRight01Icon as ArrowIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";

export type AgentStatus = "idle" | "running" | "completed" | "error";

export type AgentCardProps = React.HTMLAttributes<HTMLDivElement> & {
  name: string;
  role?: string;
  avatarUrl?: string;
  status?: AgentStatus;
  description?: string;
};

export function AgentCard({
  name,
  role,
  avatarUrl,
  status = "idle",
  description,
  className,
  children,
  ...props
}: AgentCardProps) {
  const isRunning = status === "running";

  return (
    <div
      className={cn(
        "my-3 flex flex-col gap-2.5 rounded-xl border border-border/50 bg-background/70 p-3.5 text-xs shadow-xs transition-all",
        isRunning && "border-primary/40 bg-primary/5",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <AgentAvatar name={name} avatarUrl={avatarUrl} isRunning={isRunning} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground truncate">{name}</span>
              {role ? (
                <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground font-mono">
                  {role}
                </span>
              ) : null}
            </div>
            {description ? (
              <span className="text-[11px] text-muted-foreground truncate">
                {description}
              </span>
            ) : null}
          </div>
        </div>

        <AgentStatusBadge status={status} />
      </div>

      {children}
    </div>
  );
}

export function AgentAvatar({
  name,
  avatarUrl,
  isRunning,
}: {
  name: string;
  avatarUrl?: string;
  isRunning?: boolean;
}) {
  return (
    <div className="relative">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/60 text-foreground overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="size-full object-cover" />
        ) : (
          <BotIcon className="size-4 text-primary" />
        )}
      </div>
      {isRunning ? (
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background animate-pulse" />
      ) : null}
    </div>
  );
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  switch (status) {
    case "running":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          <SpinnerIcon className="size-3 animate-spin" />
          <span>Delegating…</span>
        </span>
      );
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
          <CheckCircleIcon className="size-3" />
          <span>Completed</span>
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
          Failed
        </span>
      );
    default:
      return null;
  }
}
