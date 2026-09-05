"use client";

import * as React from "react";
import {
  RefreshIcon,
  LinkSquare01Icon as ExternalLinkIcon,
  SmartPhone01Icon as MobileIcon,
  ComputerIcon as DesktopIcon,
  LaptopIcon as TabletIcon,
  LockKeyIcon as LockIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewportMode = "desktop" | "tablet" | "mobile";

export type WebPreviewProps = React.HTMLAttributes<HTMLDivElement> & {
  url?: string;
  title?: string;
  defaultViewport?: ViewportMode;
  iframeSrc?: string;
};

export function WebPreview({
  url = "https://joey.app",
  title = "Web Preview",
  defaultViewport = "desktop",
  iframeSrc,
  className,
  children,
  ...props
}: WebPreviewProps) {
  const [viewport, setViewport] = React.useState<ViewportMode>(defaultViewport);
  const [key, setKey] = React.useState(0);

  const viewportWidth =
    viewport === "mobile"
      ? "max-w-[375px]"
      : viewport === "tablet"
      ? "max-w-[768px]"
      : "w-full";

  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-border/60 bg-background/80 overflow-hidden text-xs shadow-md",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/40 px-3 py-2 gap-2 select-none">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="size-2.5 rounded-full bg-destructive/60" />
          <span className="size-2.5 rounded-full bg-amber-500/60" />
          <span className="size-2.5 rounded-full bg-emerald-500/60" />
        </div>

        <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground flex-1 max-w-sm mx-auto truncate">
          <LockIcon className="size-3 text-emerald-500 shrink-0" />
          <span className="truncate">{url}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="hidden sm:flex items-center rounded-md border border-border/40 bg-background/50 p-0.5 mr-1">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={cn(
                "p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors",
                viewport === "desktop" && "bg-muted text-foreground"
              )}
              title="Desktop view"
            >
              <DesktopIcon className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => setViewport("tablet")}
              className={cn(
                "p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors",
                viewport === "tablet" && "bg-muted text-foreground"
              )}
              title="Tablet view"
            >
              <TabletIcon className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={cn(
                "p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors",
                viewport === "mobile" && "bg-muted text-foreground"
              )}
              title="Mobile view"
            >
              <MobileIcon className="size-3" />
            </button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setKey((k) => k + 1)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Refresh preview"
          >
            <RefreshIcon className="size-3" />
          </Button>

          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground transition-colors"
              title="Open in new tab"
            >
              <ExternalLinkIcon className="size-3" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-center p-4 bg-muted/15 min-h-[240px] max-h-[500px] overflow-auto">
        <div
          className={cn(
            "transition-all duration-300 w-full overflow-hidden rounded-lg border border-border/40 bg-background shadow-xs",
            viewportWidth
          )}
        >
          {iframeSrc ? (
            <iframe
              key={key}
              src={iframeSrc}
              title={title}
              className="w-full h-[400px] border-none"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            children ?? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                Web preview ready
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
