"use client";

import * as React from "react";
import {
  Copy01Icon as CopyIcon,
  Tick02Icon as CheckIcon,
  Delete02Icon as ClearIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TerminalProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  lines?: string[];
  onClear?: () => void;
};

export function Terminal({
  title = "Terminal",
  lines = [],
  onClear,
  className,
  children,
  ...props
}: TerminalProps) {
  const [copied, setCopied] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, children]);

  const handleCopy = () => {
    const text = lines.join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-border/60 bg-zinc-950 text-zinc-100 overflow-hidden text-xs font-mono shadow-md",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-3 py-2 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-500/80" />
            <span className="size-2.5 rounded-full bg-yellow-500/80" />
            <span className="size-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-[11px] text-zinc-400 font-medium ml-2">{title}</span>
        </div>

        <div className="flex items-center gap-1">
          {onClear ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-5 w-5 p-0 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              title="Clear terminal"
            >
              <ClearIcon className="size-3" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-5 w-5 p-0 text-zinc-400 hover:text-zinc-100 cursor-pointer"
            title="Copy output"
          >
            {copied ? <CheckIcon className="size-3 text-emerald-400" /> : <CopyIcon className="size-3" />}
          </Button>
        </div>
      </div>

      <div
        ref={bodyRef}
        className="p-3 max-h-[320px] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-800"
      >
        {children ?? (
          lines.length === 0 ? (
            <div className="text-zinc-600 italic">No output yet</div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="leading-relaxed whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}

export function TerminalPrompt({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 text-zinc-300">
      <span className="text-emerald-400 font-bold">$</span>
      <span>{command}</span>
    </div>
  );
}
