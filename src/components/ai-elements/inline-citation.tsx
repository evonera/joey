"use client";

import * as React from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Globe02Icon as GlobeIcon,
  LinkSquare01Icon as ExternalLinkIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";

export type InlineCitationProps = {
  index: number;
  url: string;
  title?: string;
  quote?: string;
  className?: string;
};

export function InlineCitation({
  index,
  url,
  title,
  quote,
  className,
}: InlineCitationProps) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    hostname = url;
  }

  const displayTitle = title || hostname;

  return (
    <HoverCard openDelay={200} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center justify-center align-baseline text-[10px] font-mono font-medium rounded-full bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-primary/20 px-1.5 py-0.5 mx-0.5 cursor-pointer select-none transition-colors border border-border/40",
            className
          )}
        >
          {index}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        className="w-72 p-3 text-xs shadow-md border border-border/60 bg-popover/95 backdrop-blur-md rounded-xl"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {hostname ? (
              <img
                src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
                alt=""
                className="size-3.5 shrink-0 rounded-xs"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate font-medium text-foreground text-xs">
              {displayTitle}
            </span>
          </div>

          {quote ? (
            <blockquote className="rounded-md border-l-2 border-primary/50 bg-muted/30 px-2 py-1.5 text-[11px] italic text-muted-foreground line-clamp-3">
              "{quote}"
            </blockquote>
          ) : null}

          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5 font-medium truncate"
          >
            <span className="truncate">{hostname || url}</span>
            <ExternalLinkIcon className="size-3 shrink-0 ml-auto text-muted-foreground" />
          </a>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function InlineCitationTrigger({
  children,
  className,
  ...props
}: React.ComponentProps<typeof HoverCardTrigger>) {
  return (
    <HoverCardTrigger
      className={cn(
        "inline-flex items-center justify-center text-[10px] font-mono rounded-full bg-muted/50 px-1.5 py-0.5 mx-0.5 cursor-pointer hover:bg-primary/20",
        className
      )}
      {...props}
    >
      {children}
    </HoverCardTrigger>
  );
}

export function InlineCitationContent({
  children,
  className,
  ...props
}: React.ComponentProps<typeof HoverCardContent>) {
  return (
    <HoverCardContent
      className={cn("w-72 p-3 text-xs shadow-md rounded-xl", className)}
      {...props}
    >
      {children}
    </HoverCardContent>
  );
}
