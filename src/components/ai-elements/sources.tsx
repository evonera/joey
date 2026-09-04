"use client";

import * as React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  Globe02Icon as GlobeIcon,
  ArrowDown01Icon as ChevronDownIcon,
  LinkSquare01Icon as ExternalLinkIcon,
} from "hugeicons-react";

export type SourcesProps = React.ComponentProps<typeof Collapsible>;

export function Sources({ className, children, ...props }: SourcesProps) {
  return (
    <Collapsible
      className={cn("group/sources my-2 flex flex-col gap-1.5 text-xs text-muted-foreground", className)}
      {...props}
    >
      {children}
    </Collapsible>
  );
}

export type SourcesTriggerProps = React.ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export function SourcesTrigger({ count, className, children, ...props }: SourcesTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-fit items-center gap-1.5 rounded-full border border-border/50 bg-background/50 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all cursor-pointer",
        className,
      )}
      {...props}
    >
      <GlobeIcon className="size-3.5 text-muted-foreground" />
      <span>{children ?? `${count} ${count === 1 ? "source" : "sources"}`}</span>
      <ChevronDownIcon className="size-3 transition-transform duration-200 group-data-[state=open]/sources:rotate-180" />
    </CollapsibleTrigger>
  );
}

export type SourcesContentProps = React.ComponentProps<typeof CollapsibleContent>;

export function SourcesContent({ className, children, ...props }: SourcesContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden",
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap gap-2 pt-1.5">
        {children}
      </div>
    </CollapsibleContent>
  );
}

export type SourceProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  title?: string;
};

export function Source({ href, title, children, className, ...props }: SourceProps) {
  let hostname = "";
  if (href) {
    try {
      hostname = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      hostname = href;
    }
  }

  const displayTitle = title || children || hostname || href;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1 text-xs text-foreground/90 hover:bg-muted hover:text-foreground transition-colors max-w-xs truncate group/source",
        className,
      )}
      {...props}
    >
      {href ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
          alt=""
          className="size-3.5 shrink-0 rounded-sm"
          onError={(e) => {
            (e.target as HTMLElement).style.display = "none";
          }}
        />
      ) : (
        <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate font-medium">{displayTitle}</span>
      <ExternalLinkIcon className="size-3 shrink-0 opacity-50 group-hover/source:opacity-100 transition-opacity ml-auto" />
    </a>
  );
}
