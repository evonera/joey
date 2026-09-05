"use client";

import * as React from "react";
import { Copy01Icon as CopyIcon, Tick02Icon as CheckIcon } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SnippetProps = React.HTMLAttributes<HTMLDivElement> & {
  code: string;
  prefix?: string;
};

export function Snippet({
  code,
  prefix = "$",
  className,
  ...props
}: SnippetProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 font-mono text-xs text-foreground shadow-xs transition-colors hover:border-border",
        className
      )}
      {...props}
    >
      {prefix ? (
        <span className="text-muted-foreground select-none">{prefix}</span>
      ) : null}
      <span className="truncate select-all">{code}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="ml-auto h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
        title="Copy snippet"
      >
        {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
      </Button>
    </div>
  );
}
