"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ConnectionProps = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color?: string;
  isAnimated?: boolean;
  className?: string;
};

export function WorkflowConnection({
  startX,
  startY,
  endX,
  endY,
  color = "var(--color-primary)",
  isAnimated = false,
  className,
}: ConnectionProps) {
  // Compute smooth cubic bezier path
  const dx = Math.abs(endX - startX) * 0.5;
  const path = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

  return (
    <svg className={cn("absolute inset-0 pointer-events-none overflow-visible", className)}>
      {/* Background outline curve */}
      <path
        d={path}
        fill="none"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={3}
      />
      {/* Main connection wire */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        className={cn(isAnimated && "animate-[dash_1.5s_linear_infinite]")}
        strokeDasharray={isAnimated ? "4,4" : undefined}
      />
      {/* Target endpoint dot */}
      <circle cx={endX} cy={endY} r={3} fill={color} />
    </svg>
  );
}
