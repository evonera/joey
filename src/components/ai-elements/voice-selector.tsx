"use client";

import * as React from "react";
import {
  VolumeHighIcon,
  PlayIcon,
  PauseIcon,
  ArrowDown01Icon as ChevronDownIcon,
  Tick02Icon as CheckIcon,
} from "hugeicons-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type VoiceOptionItem = {
  id: string;
  name: string;
  gender?: "male" | "female" | "neutral";
  accent?: string;
  previewAudioUrl?: string;
  provider?: string;
};

export type VoiceSelectorProps = {
  voices: VoiceOptionItem[];
  selectedVoiceId: string;
  onSelectVoice: (voiceId: string) => void;
  className?: string;
};

export function VoiceSelector({
  voices,
  selectedVoiceId,
  onSelectVoice,
  className,
}: VoiceSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [playingVoiceId, setPlayingVoiceId] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const current = voices.find((v) => v.id === selectedVoiceId) || voices[0];

  const handlePlayPreview = (e: React.MouseEvent, voice: VoiceOptionItem) => {
    e.stopPropagation();
    if (!voice.previewAudioUrl) return;

    if (playingVoiceId === voice.id) {
      audioRef.current?.pause();
      setPlayingVoiceId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(voice.previewAudioUrl);
      audio.onended = () => setPlayingVoiceId(null);
      audio.play().catch(() => setPlayingVoiceId(null));
      audioRef.current = audio;
      setPlayingVoiceId(voice.id);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors cursor-pointer",
            className
          )}
        >
          <VolumeHighIcon className="size-3.5 text-primary shrink-0" />
          <span className="truncate max-w-[120px]">{current?.name ?? "Select voice"}</span>
          {current?.accent ? (
            <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
              {current.accent}
            </span>
          ) : null}
          <ChevronDownIcon className="size-3 text-muted-foreground opacity-60 ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 p-1.5 shadow-md border border-border/60 bg-popover/95 backdrop-blur-md rounded-xl space-y-1"
      >
        <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
          Select TTS Voice
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {voices.map((voice) => {
            const isSelected = voice.id === selectedVoiceId;
            const isPlaying = playingVoiceId === voice.id;

            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => {
                  onSelectVoice(voice.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/70 cursor-pointer",
                  isSelected && "bg-muted font-medium text-foreground"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {voice.previewAudioUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handlePlayPreview(e, voice)}
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {isPlaying ? (
                        <PauseIcon className="size-3 text-primary" />
                      ) : (
                        <PlayIcon className="size-3" />
                      )}
                    </Button>
                  ) : null}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{voice.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {[voice.gender, voice.accent, voice.provider].filter(Boolean).join(" • ")}
                    </span>
                  </div>
                </div>

                {isSelected ? <CheckIcon className="size-4 text-primary shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
