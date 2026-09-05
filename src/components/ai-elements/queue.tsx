"use client";

import * as React from "react";
import {
  Layers01Icon as QueueIcon,
  Cancel01Icon as CancelIcon,
  Clock01Icon as ClockIcon,
  PlayIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type QueueItemData = {
  id: string;
  title: string;
  type?: string;
  status: "queued" | "processing" | "completed" | "failed";
  estimatedTime?: string;
};

export type QueueProps = React.HTMLAttributes<HTMLDivElement> & {
  items: QueueItemData[];
  onCancelItem?: (id: string) => void;
  onRunItem?: (id: string) => void;
};

export function Queue({
  items,
  onCancelItem,
  onRunItem,
  className,
  ...props
}: QueueProps) {
  return (
    <div
      className={cn(
        "my-3 flex flex-col gap-2 rounded-xl border border-border/50 bg-background/60 p-3 text-xs shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between text-muted-foreground font-medium pb-1 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <QueueIcon className="size-3.5 text-primary" />
          <span className="text-foreground font-semibold">Execution Queue</span>
        </div>
        <span className="text-[11px] font-mono">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {items.map((item, idx) => (
          <QueueItem
            key={item.id || idx}
            item={item}
            onCancel={() => onCancelItem?.(item.id)}
            onRun={() => onRunItem?.(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function QueueItem({
  item,
  onCancel,
  onRun,
}: {
  item: QueueItemData;
  onCancel?: () => void;
  onRun?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-1.5 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-2 min-w-0">
        <QueueStatus status={item.status} />
        <span className="truncate font-medium text-foreground">{item.title}</span>
        {item.type ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {item.type}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {item.estimatedTime ? (
          <span className="text-[10px] text-muted-foreground mr-1">
            {item.estimatedTime}
          </span>
        ) : null}
        {onRun && item.status === "queued" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRun}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Run immediately"
          >
            <PlayIcon className="size-3" />
          </Button>
        ) : null}
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
            title="Cancel"
          >
            <CancelIcon className="size-3" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function QueueStatus({
  status,
}: {
  status: "queued" | "processing" | "completed" | "failed";
}) {
  switch (status) {
    case "processing":
      return <span className="size-2 rounded-full bg-primary animate-pulse" />;
    case "completed":
      return <span className="size-2 rounded-full bg-emerald-500" />;
    case "failed":
      return <span className="size-2 rounded-full bg-destructive" />;
    case "queued":
    default:
      return <span className="size-2 rounded-full bg-muted-foreground/40" />;
  }
}
