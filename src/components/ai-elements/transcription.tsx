"use client";

import * as React from "react";
import { Mic01Icon as MicIcon, Copy01Icon as CopyIcon, Tick02Icon as CheckIcon } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TranscriptionSegment = {
  id?: string;
  speaker?: string;
  text: string;
  timestamp?: string;
  isFinal?: boolean;
};

export type TranscriptionProps = React.HTMLAttributes<HTMLDivElement> & {
  segments: TranscriptionSegment[];
  isLive?: boolean;
};

export function Transcription({
  segments,
  isLive = false,
  className,
  ...props
}: TranscriptionProps) {
  const [copied, setCopied] = React.useState(false);

  const fullText = segments.map((s) => s.text).join(" ");

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-border/50 bg-background/70 p-3.5 text-xs shadow-xs space-y-2",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <MicIcon className="size-3.5 text-primary" />
          <span className="font-semibold text-foreground">Transcript</span>
          {isLive ? (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.2 text-[10px] font-medium text-red-500">
              <span className="size-1.5 rounded-full bg-red-500 animate-ping" />
              Live
            </span>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Copy transcript"
        >
          {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
        </Button>
      </div>

      <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto">
        {segments.map((seg, idx) => (
          <div key={seg.id || idx} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {seg.speaker ? (
                <span className="font-medium text-foreground">{seg.speaker}</span>
              ) : null}
              {seg.timestamp ? <span>{seg.timestamp}</span> : null}
            </div>
            <p
              className={cn(
                "text-xs leading-relaxed text-foreground/90",
                !seg.isFinal && "text-muted-foreground italic"
              )}
            >
              {seg.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
