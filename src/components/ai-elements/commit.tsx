"use client";

import * as React from "react";
import {
  GitCommitIcon as CommitIcon,
  GitBranchIcon as BranchIcon,
  Copy01Icon as CopyIcon,
  Tick02Icon as CheckIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CommitProps = React.HTMLAttributes<HTMLDivElement> & {
  hash: string;
  message: string;
  author?: {
    name: string;
    avatarUrl?: string;
  };
  branch?: string;
  timestamp?: string | Date;
  filesChanged?: number;
};

export function CommitCard({
  hash,
  message,
  author,
  branch,
  timestamp,
  filesChanged,
  className,
  ...props
}: CommitProps) {
  const [copied, setCopied] = React.useState(false);
  const shortHash = hash.slice(0, 7);

  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = timestamp
    ? typeof timestamp === "string"
      ? timestamp
      : timestamp.toLocaleDateString()
    : null;

  return (
    <div
      className={cn(
        "my-2 flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <CommitIcon className="size-3.5" />
        </span>

        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate font-medium text-foreground">{message}</span>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {author ? <span>{author.name}</span> : null}
            {formattedDate ? <span>• {formattedDate}</span> : null}
            {branch ? (
              <span className="flex items-center gap-1 font-mono text-[10px] rounded bg-muted/60 px-1 py-0.2">
                <BranchIcon className="size-2.5" />
                {branch}
              </span>
            ) : null}
            {typeof filesChanged === "number" ? (
              <span>• {filesChanged} files</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 font-mono">
        <span className="rounded bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {shortHash}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Copy commit hash"
        >
          {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
        </Button>
      </div>
    </div>
  );
}
