"use client";

import * as React from "react";
import {
  Download01Icon as DownloadIcon,
  MaximizeScreenIcon as FullscreenIcon,
  Cancel01Icon as CloseIcon,
  Copy01Icon as CopyIcon,
  Tick02Icon as CheckIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AIImageProps = React.HTMLAttributes<HTMLDivElement> & {
  src: string;
  alt?: string;
  prompt?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:5";
  onDownload?: () => void;
};

export function AIImage({
  src,
  alt = "Generated AI Image",
  prompt,
  aspectRatio = "1:1",
  onDownload,
  className,
  ...props
}: AIImageProps) {
  const [isLightboxOpen, setIsLightboxOpen] = React.useState(false);
  const [copiedPrompt, setCopiedPrompt] = React.useState(false);

  const handleCopyPrompt = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    const a = document.createElement("a");
    a.href = src;
    a.download = `${alt.toLowerCase().replace(/\s+/g, "_")}.png`;
    a.target = "_blank";
    a.click();
  };

  const aspectClass =
    aspectRatio === "16:9"
      ? "aspect-video"
      : aspectRatio === "9:16"
      ? "aspect-[9/16]"
      : aspectRatio === "4:5"
      ? "aspect-[4/5]"
      : "aspect-square";

  return (
    <>
      <div
        className={cn(
          "group relative my-3 overflow-hidden rounded-xl border border-border/50 bg-muted/20 text-xs shadow-xs transition-all",
          aspectClass,
          className
        )}
        {...props}
      >
        <img
          src={src}
          alt={alt}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          loading="lazy"
        />

        {/* Hover overlay actions */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3 select-none">
          <div className="flex items-center justify-between">
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-mono text-white/90 backdrop-blur-xs">
              {aspectRatio}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                className="flex size-7 items-center justify-center rounded-lg bg-black/60 text-white/90 hover:bg-black/90 hover:text-white transition-colors cursor-pointer"
                title="View full size"
              >
                <FullscreenIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="flex size-7 items-center justify-center rounded-lg bg-black/60 text-white/90 hover:bg-black/90 hover:text-white transition-colors cursor-pointer"
                title="Download image"
              >
                <DownloadIcon className="size-3.5" />
              </button>
            </div>
          </div>

          {prompt ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-black/60 p-2 backdrop-blur-xs">
              <p className="text-[11px] text-white/90 line-clamp-2 leading-relaxed">
                {prompt}
              </p>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="size-6 p-1 text-white/70 hover:text-white shrink-0 cursor-pointer"
                title="Copy prompt"
              >
                {copiedPrompt ? (
                  <CheckIcon className="size-3.5 text-emerald-400" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Lightbox Modal */}
      {isLightboxOpen ? (
        <div
          onClick={() => setIsLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm cursor-zoom-out select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl shadow-2xl cursor-default"
          >
            <img src={src} alt={alt} className="max-h-[85vh] max-w-[85vw] object-contain" />
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black transition-colors cursor-pointer"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
