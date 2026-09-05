"use client";

import * as React from "react";
import {
  Add01Icon as ZoomInIcon,
  Remove01Icon as ZoomOutIcon,
  MaximizeScreenIcon as FitViewIcon,
} from "hugeicons-react";
import { Lock, Unlock, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkflowControlsProps = React.HTMLAttributes<HTMLDivElement> & {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  showMinimap?: boolean;
  onToggleMinimap?: () => void;
};

export function WorkflowControls({
  onZoomIn,
  onZoomOut,
  onFitView,
  isLocked = false,
  onToggleLock,
  showMinimap = false,
  onToggleMinimap,
  className,
  ...props
}: WorkflowControlsProps) {
  return (
    <div
      className={cn(
        "absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-xl border border-border/50 bg-background/80 p-1 backdrop-blur-md shadow-md",
        className
      )}
      {...props}
    >
      {onZoomIn ? (
        <ControlButton onClick={onZoomIn} title="Zoom in">
          <ZoomInIcon className="size-3.5" />
        </ControlButton>
      ) : null}

      {onZoomOut ? (
        <ControlButton onClick={onZoomOut} title="Zoom out">
          <ZoomOutIcon className="size-3.5" />
        </ControlButton>
      ) : null}

      {onFitView ? (
        <ControlButton onClick={onFitView} title="Fit to view">
          <FitViewIcon className="size-3.5" />
        </ControlButton>
      ) : null}

      {onToggleLock ? (
        <ControlButton
          onClick={onToggleLock}
          title={isLocked ? "Unlock canvas" : "Lock canvas"}
          className={cn(isLocked && "text-primary bg-primary/10")}
        >
          {isLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
        </ControlButton>
      ) : null}

      {onToggleMinimap ? (
        <ControlButton
          onClick={onToggleMinimap}
          title={showMinimap ? "Hide minimap" : "Show minimap"}
          className={cn(showMinimap && "text-primary bg-primary/10")}
        >
          <MapIcon className="size-3.5" />
        </ControlButton>
      ) : null}
    </div>
  );
}

export function ControlButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
