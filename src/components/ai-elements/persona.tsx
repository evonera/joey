"use client";

import * as React from "react";
import { BotIcon, SparklesIcon } from "hugeicons-react";
import { cn } from "@/lib/utils";

export type PersonaState = "idle" | "listening" | "thinking" | "speaking";

export type PersonaProps = React.HTMLAttributes<HTMLDivElement> & {
  name: string;
  state?: PersonaState;
  avatarUrl?: string;
  voiceStyle?: string;
};

export function Persona({
  name,
  state = "idle",
  avatarUrl,
  voiceStyle,
  className,
  ...props
}: PersonaProps) {
  const isSpeaking = state === "speaking";
  const isListening = state === "listening";
  const isThinking = state === "thinking";

  return (
    <div
      className={cn(
        "my-3 flex items-center gap-3 rounded-xl border border-border/50 bg-background/70 p-3 text-xs shadow-xs select-none",
        className
      )}
      {...props}
    >
      <div className="relative flex items-center justify-center">
        {isSpeaking ? (
          <>
            <span className="absolute size-10 rounded-full bg-primary/20 animate-ping opacity-75" />
            <span className="absolute size-12 rounded-full bg-primary/10 animate-pulse" />
          </>
        ) : isListening ? (
          <span className="absolute size-10 rounded-full bg-emerald-500/20 animate-pulse" />
        ) : null}

        <div className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/60 text-foreground overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="size-full object-cover" />
          ) : (
            <BotIcon className="size-5 text-primary" />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground text-sm truncate">{name}</span>
          {voiceStyle ? (
            <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground">
              {voiceStyle}
            </span>
          ) : null}
        </div>
        <PersonaStatus state={state} />
      </div>
    </div>
  );
}

export function PersonaStatus({ state }: { state: PersonaState }) {
  switch (state) {
    case "speaking":
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          Speaking…
        </span>
      );
    case "listening":
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-emerald-500 font-medium">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Listening…
        </span>
      );
    case "thinking":
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-amber-500 font-medium">
          <SparklesIcon className="size-3 animate-spin" />
          Thinking…
        </span>
      );
    case "idle":
    default:
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
          Ready
        </span>
      );
  }
}
