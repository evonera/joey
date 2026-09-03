"use client";

import * as React from "react";
import { 
  IconPlayerPlay, 
  IconPlayerPause, 
  IconRefresh, 
  IconVolume, 
  IconVolumeOff
} from "@tabler/icons-react";
import type { RemotionCompositionProps } from "@/lib/theme-studio/renderers/video-renderer";

interface RemotionPreviewPlayerProps {
  composition: RemotionCompositionProps;
}

export function RemotionPreviewPlayer({ composition }: RemotionPreviewPlayerProps) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isMuted, setIsMuted] = React.useState(false);

  const totalDuration = composition.scenes.reduce(
    (acc, scene) => acc + scene.durationInSeconds,
    0
  );

  // Determine active scene based on currentTime
  let activeSceneIndex = 0;
  let elapsed = 0;
  for (let i = 0; i < composition.scenes.length; i++) {
    const s = composition.scenes[i];
    if (currentTime >= elapsed && currentTime < elapsed + s.durationInSeconds) {
      activeSceneIndex = i;
      break;
    }
    elapsed += s.durationInSeconds;
  }
  const currentScene = composition.scenes[activeSceneIndex] || composition.scenes[0];

  React.useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, totalDuration]);

  return (
    <div className="flex flex-col items-center space-y-4 max-w-xs mx-auto">
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
          {composition.scenes.map((scene, idx) => (
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
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          {isPlaying ? <IconPlayerPause className="w-4 h-4" /> : <IconPlayerPlay className="w-4 h-4" />}
        </button>

        <button
          onClick={() => {
            setCurrentTime(0);
            setIsPlaying(true);
          }}
          className="p-2 rounded-xl border hover:bg-muted text-muted-foreground transition-colors"
          title="Restart"
        >
          <IconRefresh className="w-4 h-4" />
        </button>

        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 rounded-xl border hover:bg-muted text-muted-foreground transition-colors"
        >
          {isMuted ? <IconVolumeOff className="w-4 h-4" /> : <IconVolume className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
