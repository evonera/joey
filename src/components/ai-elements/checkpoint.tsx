"use client";

import * as React from "react";
import {
  GitCommitIcon as CheckpointIcon,
  RotateLeft01Icon as RestoreIcon,
  ArrowRight01Icon as ArrowRightIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CheckpointProps = React.HTMLAttributes<HTMLDivElement> & {
  id?: string;
  timestamp?: string | Date;
  title?: string;
  onRestore?: () => void;
  canRestore?: boolean;
};

export const Checkpoint = React.forwardRef<HTMLDivElement, CheckpointProps>(
  (
    {
      className,
      id,
      timestamp,
      title = "Checkpoint created",
      onRestore,
      canRestore = true,
      children,
      ...props
    },
    ref
  ) => {
    const formattedTime = timestamp
      ? typeof timestamp === "string"
        ? timestamp
        : timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null;

    return (
      <div
        ref={ref}
        className={cn(
          "relative my-3 flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2 text-xs text-muted-foreground transition-all hover:bg-muted/30",
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckpointIcon className="size-3.5" />
          </span>
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-medium text-foreground">{title}</span>
            {formattedTime ? (
              <span className="text-[10px] text-muted-foreground/80">
                • {formattedTime}
              </span>
            ) : null}
          </div>
        </div>

        {children}

        {canRestore && onRestore ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRestore}
            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground hover:bg-background/80 cursor-pointer"
          >
            <RestoreIcon className="size-3" />
            <span>Restore</span>
          </Button>
        ) : null}
      </div>
    );
  }
);
Checkpoint.displayName = "Checkpoint";

export function CheckpointTrigger({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
      <ArrowRightIcon className="size-3" />
    </button>
  );
}

export function CheckpointContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-2 rounded-md border border-border/40 bg-background/50 p-2.5 text-xs", className)}
      {...props}
    >
      {children}
    </div>
  );
}
