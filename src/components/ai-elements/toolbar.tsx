"use client";

import * as React from "react";
import {
  PlayIcon,
  FloppyDiskIcon as SaveIcon,
  Add01Icon as AddIcon,
  RotateLeft01Icon as UndoIcon,
  RotateRight01Icon as RedoIcon,
  Download01Icon as ExportIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkflowToolbarProps = React.HTMLAttributes<HTMLDivElement> & {
  onAddNode?: () => void;
  onRun?: () => void;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onExport?: () => void;
  isSaving?: boolean;
  isRunning?: boolean;
};

export function WorkflowToolbar({
  onAddNode,
  onRun,
  onSave,
  onUndo,
  onRedo,
  onExport,
  isSaving = false,
  isRunning = false,
  className,
  ...props
}: WorkflowToolbarProps) {
  return (
    <div
      className={cn(
        "absolute top-4 left-4 z-10 flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/80 p-1.5 backdrop-blur-md shadow-md select-none",
        className
      )}
      {...props}
    >
      {onAddNode ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddNode}
          className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer shadow-none"
        >
          <AddIcon className="size-3.5" />
          <span>Add Step</span>
        </Button>
      ) : null}

      {onRun ? (
        <Button
          type="button"
          size="sm"
          onClick={onRun}
          disabled={isRunning}
          className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer"
        >
          <PlayIcon className="size-3.5" />
          <span>{isRunning ? "Running…" : "Run Flow"}</span>
        </Button>
      ) : null}

      <div className="h-4 w-px bg-border/50 mx-0.5" />

      {onSave ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSave}
          disabled={isSaving}
          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Save flow"
        >
          <SaveIcon className="size-3.5" />
          <span className="hidden sm:inline">{isSaving ? "Saving…" : "Save"}</span>
        </Button>
      ) : null}

      {onUndo ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onUndo}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Undo"
        >
          <UndoIcon className="size-3.5" />
        </Button>
      ) : null}

      {onRedo ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRedo}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Redo"
        >
          <RedoIcon className="size-3.5" />
        </Button>
      ) : null}

      {onExport ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onExport}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Export flow JSON"
        >
          <ExportIcon className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
