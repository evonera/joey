"use client";

import * as React from "react";
import {
  PlayIcon,
  PauseIcon,
  VolumeHighIcon,
  VolumeMute02Icon as VolumeMuteIcon,
  RotateLeft01Icon as ReplayIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AudioPlayerProps = React.HTMLAttributes<HTMLDivElement> & {
  src?: string;
  title?: string;
  autoPlay?: boolean;
};

export function AudioPlayer({
  src,
  title,
  autoPlay = false,
  className,
  ...props
}: AudioPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [playbackRate, setPlaybackRate] = React.useState(1);
  const [isMuted, setIsMuted] = React.useState(false);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextSpeed = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div
      className={cn(
        "my-2 flex items-center gap-3 rounded-xl border border-border/50 bg-background/80 px-3.5 py-2 text-xs shadow-xs select-none",
        className
      )}
      {...props}
    >
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          autoPlay={autoPlay}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={togglePlay}
        className="h-8 w-8 rounded-full p-0 shrink-0 cursor-pointer shadow-none"
      >
        {isPlaying ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5 ml-0.5" />}
      </Button>

      <div className="flex flex-1 flex-col gap-1 min-w-0">
        {title ? (
          <span className="truncate font-medium text-foreground text-xs">{title}</span>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="h-1.5 flex-1 appearance-none rounded-full bg-muted/80 accent-primary cursor-pointer"
          />
          <span className="font-mono text-[10px] text-muted-foreground shrink-0">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={cycleSpeed}
          className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          title="Playback speed"
        >
          {playbackRate}x
        </button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleMute}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeMuteIcon className="size-3.5" /> : <VolumeHighIcon className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (isNaN(sec) || sec === 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
