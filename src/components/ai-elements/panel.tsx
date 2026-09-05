"use client";

import * as React from "react";
import { Cancel01Icon as CloseIcon } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkflowPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  onClose?: () => void;
  isOpen?: boolean;
};

export function WorkflowPanel({
  title = "Node Configuration",
  onClose,
  isOpen = true,
  className,
  children,
  ...props
}: WorkflowPanelProps) {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "absolute top-4 right-4 z-20 flex flex-col w-80 max-h-[calc(100%-2rem)] rounded-xl border border-border/60 bg-background/95 backdrop-blur-md p-4 text-xs shadow-xl space-y-3 overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between pb-2 border-b border-border/30 select-none">
        <span className="font-semibold text-foreground text-sm truncate">{title}</span>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Close panel"
          >
            <CloseIcon className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin">
        {children}
      </div>
    </div>
  );
}

export function PanelSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider select-none">
        {title}
      </span>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
