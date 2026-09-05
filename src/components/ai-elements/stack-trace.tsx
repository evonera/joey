"use client";

import * as React from "react";
import {
  AlertCircleIcon,
  Copy01Icon as CopyIcon,
  Tick02Icon as CheckIcon,
  ArrowRight01Icon as ChevronRightIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StackFrame = {
  file: string;
  line: number;
  column?: number;
  method?: string;
  isInternal?: boolean;
};

export type StackTraceProps = React.HTMLAttributes<HTMLDivElement> & {
  errorName?: string;
  message: string;
  frames?: StackFrame[];
  rawTrace?: string;
};

export function StackTrace({
  errorName = "Error",
  message,
  frames,
  rawTrace,
  className,
  ...props
}: StackTraceProps) {
  const [copied, setCopied] = React.useState(false);
  const [expanded, setExpanded] = React.useState(true);

  const parsedFrames: StackFrame[] = React.useMemo(() => {
    if (frames) return frames;
    if (!rawTrace) return [];
    const lines = rawTrace.split("\n");
    const result: StackFrame[] = [];
    for (const line of lines) {
      const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
      if (match) {
        result.push({
          method: match[1] || undefined,
          file: match[2],
          line: parseInt(match[3], 10),
          column: parseInt(match[4], 10),
          isInternal: match[2].includes("node_modules") || match[2].startsWith("node:"),
        });
      }
    }
    return result;
  }, [frames, rawTrace]);

  const handleCopy = () => {
    const text = rawTrace || `${errorName}: ${message}\n` + parsedFrames.map((f) => `  at ${f.method || ""} (${f.file}:${f.line})`).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-xs font-mono shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <AlertCircleIcon className="size-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-destructive">{errorName}</span>
            <p className="text-muted-foreground break-words mt-0.5">{message}</p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          title="Copy stack trace"
        >
          {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
        </Button>
      </div>

      {parsedFrames.length > 0 ? (
        <div className="mt-3 border-t border-destructive/20 pt-2 flex flex-col gap-1">
          {parsedFrames.map((frame, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1 text-[11px]",
                frame.isInternal
                  ? "text-muted-foreground/60"
                  : "text-foreground font-medium bg-destructive/10"
              )}
            >
              <span className="truncate flex-1">
                {frame.method ? (
                  <span className="text-foreground/90 font-semibold mr-1.5">
                    {frame.method}
                  </span>
                ) : null}
                <span className="text-muted-foreground font-normal truncate">
                  {frame.file}:{frame.line}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
