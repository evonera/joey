"use client";

import * as React from "react";
import { Cancel01Icon as DeleteIcon } from "hugeicons-react";
import { cn } from "@/lib/utils";

export type WorkflowEdgeProps = {
  id?: string;
  label?: string;
  condition?: "true" | "false" | "success" | "error" | "default";
  onDelete?: () => void;
  midX?: number;
  midY?: number;
  className?: string;
};

export function WorkflowEdge({
  id,
  label,
  condition = "default",
  onDelete,
  midX = 0,
  midY = 0,
  className,
}: WorkflowEdgeProps) {
  if (!label && !onDelete) return null;

  const conditionTone =
    condition === "true" || condition === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
      : condition === "false" || condition === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-border/60 bg-background/80 text-muted-foreground";

  return (
    <div
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono shadow-xs backdrop-blur-xs select-none",
        conditionTone,
        className
      )}
      style={{ left: `${midX}px`, top: `${midY}px` }}
    >
      {label ? <span>{label}</span> : null}

      {onDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 rounded-full hover:bg-background/80 transition-colors cursor-pointer"
          title="Delete connection"
        >
          <DeleteIcon className="size-2.5" />
        </button>
      ) : null}
    </div>
  );
}
