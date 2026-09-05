"use client";

import * as React from "react";
import { CpuIcon as BrainIcon, ArrowDown01Icon as ChevronDownIcon } from "hugeicons-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type ContextProps = React.ComponentProps<typeof Collapsible> & {
  usedTokens?: number;
  maxTokens?: number;
};

export function Context({
  className,
  usedTokens = 0,
  maxTokens = 128_000,
  children,
  ...props
}: ContextProps) {
  const percentage = Math.min(100, Math.round((usedTokens / maxTokens) * 100));

  return (
    <Collapsible
      className={cn("group/context my-2 flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/15 p-2.5 text-xs", className)}
      {...props}
    >
      {children}
    </Collapsible>
  );
}

export function ContextTrigger({
  usedTokens,
  maxTokens,
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  usedTokens?: number;
  maxTokens?: number;
}) {
  const percentage =
    usedTokens && maxTokens
      ? Math.min(100, Math.round((usedTokens / maxTokens) * 100))
      : null;

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        <BrainIcon className="size-3.5 text-primary" />
        <span>{children ?? "Context Window"}</span>
      </div>
      <div className="flex items-center gap-2">
        {usedTokens ? (
          <span className="text-[11px] font-mono text-muted-foreground">
            {formatTokens(usedTokens)} {maxTokens ? `/ ${formatTokens(maxTokens)}` : ""}
            {percentage !== null ? ` (${percentage}%)` : ""}
          </span>
        ) : null}
        <ChevronDownIcon className="size-3 transition-transform duration-200 group-data-[state=open]/context:rotate-180" />
      </div>
    </CollapsibleTrigger>
  );
}

export function ContextContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn("overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down pt-2 space-y-2", className)}
      {...props}
    >
      {children}
    </CollapsibleContent>
  );
}

export function ContextBar({
  usedTokens,
  maxTokens,
  className,
}: {
  usedTokens: number;
  maxTokens: number;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (usedTokens / maxTokens) * 100));
  const tone =
    pct > 85
      ? "bg-destructive"
      : pct > 65
      ? "bg-amber-500"
      : "bg-primary";

  return (
    <div className={cn("h-1.5 w-full rounded-full bg-muted/60 overflow-hidden", className)}>
      <div
        className={cn("h-full transition-all duration-300 rounded-full", tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ContextTokenBreakdown({
  items,
  className,
}: {
  items: Array<{ label: string; tokens: number; color?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2 text-[11px]", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/50 px-2 py-1"
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: item.color || "var(--color-primary)" }}
          />
          <span className="text-muted-foreground">{item.label}:</span>
          <span className="font-mono font-medium text-foreground">
            {formatTokens(item.tokens)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${tokens}`;
}
