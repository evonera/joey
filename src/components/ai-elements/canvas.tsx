"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type WorkflowCanvasProps = React.HTMLAttributes<HTMLDivElement> & {
  gridSize?: number;
  showGrid?: boolean;
};

export const WorkflowCanvas = React.forwardRef<HTMLDivElement, WorkflowCanvasProps>(
  ({ className, gridSize = 20, showGrid = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative h-full w-full overflow-hidden bg-[#0a0908] select-none",
          className
        )}
        style={
          showGrid
            ? {
                backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)`,
                backgroundSize: `${gridSize}px ${gridSize}px`,
              }
            : undefined
        }
        {...props}
      >
        <div className="absolute inset-0 h-full w-full">{children}</div>
      </div>
    );
  }
);
WorkflowCanvas.displayName = "WorkflowCanvas";

export function CanvasGrid({
  size = 20,
  dotColor = "rgba(255, 255, 255, 0.08)",
  className,
}: {
  size?: number;
  dotColor?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("absolute inset-0 pointer-events-none", className)}
      style={{
        backgroundImage: `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}

export function CanvasViewport({
  children,
  zoom = 1,
  pan = { x: 0, y: 0 },
  className,
}: {
  children: React.ReactNode;
  zoom?: number;
  pan?: { x: number; y: number };
  className?: string;
}) {
  return (
    <div
      className={cn("absolute inset-0 origin-top-left transition-transform", className)}
      style={{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      }}
    >
      {children}
    </div>
  );
}
