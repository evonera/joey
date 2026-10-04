"use client";

import * as React from "react";
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react";
import type { VideoPreviewComposition } from "@/lib/theme-studio/renderers/video-scene-spec";

interface ScenePreviewPlayerProps {
  composition: VideoPreviewComposition;
}

export function ScenePreviewPlayer({ composition }: ScenePreviewPlayerProps) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const scenes = composition.scenes.filter(scene => Number.isFinite(scene.durationInSeconds) && scene.durationInSeconds > 0);
  const compositionKey = JSON.stringify(composition);
  React.useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
  }, [compositionKey]);

  const totalDuration = scenes.reduce(
    (acc, scene) => acc + scene.durationInSeconds,
    0
  );

  // Determine active scene based on currentTime
  let activeSceneIndex = Math.max(0, scenes.length - 1);
  let elapsed = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (currentTime < elapsed + s.durationInSeconds || i === scenes.length - 1) {
      activeSceneIndex = i;
      break;
    }
    elapsed += s.durationInSeconds;
  }
  const currentScene = scenes[activeSceneIndex];

  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isPlaying && totalDuration > 0) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          return Math.min(totalDuration, prev + 0.1);
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, totalDuration]);
  React.useEffect(() => {
    if (currentTime >= totalDuration) setIsPlaying(false);
  }, [currentTime, totalDuration]);

  if (!currentScene) return <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No storyboard scenes yet.</div>;

  return (
    <div className="flex flex-col items-center space-y-4 max-w-xs mx-auto">
      <p className="text-xs text-muted-foreground text-center">Storyboard preview · approximate timing, no audio. Review the finished MP4 before approval.</p>
      {/* 9:16 Vertical Video Screen */}
      <div
        style={{
          background: composition.brandKit?.primaryColor || "#0f172a",
          aspectRatio: "9/16",
          width: "100%",
          maxWidth: "320px",
          borderColor: composition.brandKit?.accentColor || "#38bdf8",
        }}
        className="rounded-3xl shadow-2xl overflow-hidden relative border flex flex-col justify-between p-6 select-none"
      >
        {/* Top Progress Bars (Story/Reel style) */}
        <div className="flex gap-1.5 w-full">
          {scenes.map((scene, idx) => (
            <div
              key={scene.id}
              className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden"
            >
              <div
                style={{
                  width:
                    idx < activeSceneIndex
                      ? "100%"
                      : idx === activeSceneIndex
                      ? `${(Math.max(0, currentTime - elapsed) / scene.durationInSeconds) * 100}%`
                      : "0%",
                  backgroundColor: composition.brandKit?.accentColor || "#38bdf8",
                }}
                className="h-full transition-all duration-75"
              />
            </div>
          ))}
        </div>

        {/* Dynamic Scene Content */}
        <div className="my-auto py-4 text-center space-y-3">
          <span
            style={{
              backgroundColor: `${composition.brandKit?.accentColor || "#38bdf8"}25`,
              color: composition.brandKit?.accentColor || "#38bdf8",
            }}
            className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase inline-block border border-white/10"
          >
            {currentScene.type.toUpperCase()}
          </span>

          <h2 className="text-xl font-extrabold text-white leading-tight drop-shadow-md">
            {currentScene.title}
          </h2>

          <p className="text-xs text-white/90 font-medium px-2 leading-relaxed bg-black/30 p-2.5 rounded-xl backdrop-blur-sm">
            "{currentScene.narrationText}"
          </p>
        </div>

        {/* Footer Handle */}
        <div className="flex items-center justify-between text-xs text-white/70 border-t border-white/10 pt-3">
          <span className="font-bold">{composition.brandKit?.watermark || "@ThemePage"}</span>
          <span className="text-[10px] font-mono">{currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s</span>
        </div>
      </div>

      {/* Media Controls */}
      <div className="flex items-center gap-3 bg-muted/40 p-2 rounded-2xl border w-full justify-center text-xs">
        <button
          type="button"
          aria-label={isPlaying ? "Pause storyboard" : "Play storyboard"}
          onClick={() => { if (currentTime >= totalDuration) setCurrentTime(0); setIsPlaying(!isPlaying); }}
          className="p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          {isPlaying ? <IconPlayerPause className="w-4 h-4" /> : <IconPlayerPlay className="w-4 h-4" />}
        </button>

        <button
          type="button"
          aria-label="Restart storyboard"
          onClick={() => {
            setCurrentTime(0);
            setIsPlaying(true);
          }}
          className="p-2 rounded-xl border hover:bg-muted text-muted-foreground transition-colors"
          title="Restart"
        >
          <IconRefresh className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
}
