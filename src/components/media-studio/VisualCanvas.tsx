'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import {
  type CanvasConfig,
  type CanvasStickerType,
  ASPECT_RATIO_DIMENSIONS,
} from "./types";

export interface VisualCanvasProps {
  config: CanvasConfig;
  imageUrl?: string | null;
  solidColor?: string;
  className?: string;
  onRendered?: (dataUrl: string) => void;
}

export interface VisualCanvasHandle {
  exportBlob: (quality?: number) => Promise<Blob | null>;
  exportDataUrl: (quality?: number) => string | null;
  getCanvas: () => HTMLCanvasElement | null;
}

export const VisualCanvas = forwardRef<VisualCanvasHandle, VisualCanvasProps>(
  function VisualCanvas(
    {
      config,
      imageUrl,
      solidColor = "#111114",
      className = "w-full h-auto rounded-lg shadow-xl block",
      onRendered,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

    const exportBlob = useCallback(
      (quality = 0.92): Promise<Blob | null> => {
        return new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) {
            resolve(null);
            return;
          }
          canvas.toBlob(
            (blob) => {
              resolve(blob);
            },
            "image/jpeg",
            quality,
          );
        });
      },
      [],
    );

    const exportDataUrl = useCallback((quality = 0.92): string | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      try {
        return canvas.toDataURL("image/jpeg", quality);
      } catch (err) {
        console.warn("Failed to export data URL from canvas (possible CORS taint):", err);
        return null;
      }
    }, []);

    const getCanvas = useCallback(() => canvasRef.current, []);

    useImperativeHandle(
      ref,
      () => ({
        exportBlob,
        exportDataUrl,
        getCanvas,
      }),
      [exportBlob, exportDataUrl, getCanvas],
    );

    // Helper to load image with CORS credentials handling
    const loadImage = useCallback((src: string): Promise<HTMLImageElement> => {
      if (imageCacheRef.current.has(src)) {
        const cached = imageCacheRef.current.get(src)!;
        if (cached.complete && cached.naturalWidth > 0) {
          return Promise.resolve(cached);
        }
      }

      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          imageCacheRef.current.set(src, img);
          resolve(img);
        };
        img.onerror = (e) => {
          console.warn("Failed to load canvas background image:", src, e);
          reject(e);
        };
        img.src = src;
      });
    }, []);

    useEffect(() => {
      let isCancelled = false;

      async function render() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dim = ASPECT_RATIO_DIMENSIONS[config.aspectRatio] ?? ASPECT_RATIO_DIMENSIONS["16:9"];
        const targetWidth = dim.width;
        const targetHeight = dim.height;

        // 1. Ensure fonts are loaded before drawing text
        if (typeof document !== "undefined" && document.fonts) {
          try {
            await document.fonts.load(`${config.fontSize}px "${config.fontFamily}"`);
            await document.fonts.ready;
          } catch {
            // Ignore font loading errors, canvas will fall back cleanly
          }
        }

        if (isCancelled) return;

        // Set dimensions
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Clear canvas
        ctx.clearRect(0, 0, targetWidth, targetHeight);

        // Apply brightness and contrast filters
        if (config.brightness !== 0 || config.contrast !== 0) {
          const b = 100 + config.brightness;
          const c = 100 + config.contrast;
          ctx.filter = `brightness(${b}%) contrast(${c}%)`;
        } else {
          ctx.filter = "none";
        }

        // 2. Draw Background Image or Solid Color
        if (imageUrl) {
          try {
            const img = await loadImage(imageUrl);
            if (isCancelled) return;

            // Draw image covering canvas dimensions (object-cover)
            const scale = Math.max(targetWidth / img.naturalWidth, targetHeight / img.naturalHeight);
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;
            const x = (targetWidth - w) / 2;
            const y = (targetHeight - h) / 2;
            ctx.drawImage(img, x, y, w, h);
          } catch {
            ctx.fillStyle = solidColor;
            ctx.fillRect(0, 0, targetWidth, targetHeight);
          }
        } else {
          // Elegant dark radial gradient background if no image
          const bgGrad = ctx.createLinearGradient(0, 0, targetWidth, targetHeight);
          bgGrad.addColorStop(0, "#1c1917");
          bgGrad.addColorStop(1, solidColor || "#0c0a09");
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, targetWidth, targetHeight);
        }

        // Reset filter for overlays
        ctx.filter = "none";

        // 3. Draw Dark Bottom / Vignette for text contrast
        if (config.overlayVignette) {
          const gradient = ctx.createLinearGradient(0, targetHeight * 0.35, 0, targetHeight);
          gradient.addColorStop(0, "rgba(0,0,0,0)");
          gradient.addColorStop(0.6, "rgba(0,0,0,0.5)");
          gradient.addColorStop(1, "rgba(0,0,0,0.85)");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, targetWidth, targetHeight);
        }

        // 4. Draw Viral Sticker
        if (config.sticker && config.sticker !== "none") {
          drawSticker(ctx, config.sticker, config.stickerPosition, targetWidth, targetHeight);
        }

        // 5. Draw Dynamic Text Overlay
        if (config.text.trim()) {
          drawTextOverlay(ctx, config, targetWidth, targetHeight);
        }

        // Trigger onRendered callback
        if (!isCancelled && onRendered) {
          try {
            const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
            onRendered(dataUrl);
          } catch {
            // CORS tainted fallback
          }
        }
      }

      void render();

      return () => {
        isCancelled = true;
      };
    }, [config, imageUrl, solidColor, loadImage, onRendered]);

    return <canvas ref={canvasRef} className={className} />;
  },
);

VisualCanvas.displayName = "VisualCanvas";

function drawSticker(
  ctx: CanvasRenderingContext2D,
  sticker: CanvasStickerType,
  position: "left" | "right" | "center",
  width: number,
  height: number,
) {
  ctx.save();

  // Scale stickers according to canvas dimensions relative to 1280x720
  const scaleFactor = Math.min(width / 1280, height / 720) * 1.1;

  // Base positions
  let x = width * 0.78;
  let y = height * 0.42;

  if (position === "left") {
    x = width * 0.22;
    y = height * 0.42;
  } else if (position === "center") {
    x = width * 0.5;
    y = height * 0.45;
  }

  if (sticker === "arrow") {
    ctx.translate(x, y);
    ctx.scale(scaleFactor, scaleFactor);
    ctx.rotate(position === "left" ? 0.35 : -0.45);

    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 6;

    // Outer white stroke
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(0, -35);
    ctx.lineTo(85, -35);
    ctx.lineTo(85, -65);
    ctx.lineTo(165, 0);
    ctx.lineTo(85, 65);
    ctx.lineTo(85, 35);
    ctx.lineTo(0, 35);
    ctx.closePath();
    ctx.fill();

    // Inner bright red fill
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#FF1E1E";
    ctx.beginPath();
    ctx.moveTo(8, -25);
    ctx.lineTo(77, -25);
    ctx.lineTo(77, -50);
    ctx.lineTo(145, 0);
    ctx.lineTo(77, 50);
    ctx.lineTo(77, 25);
    ctx.lineTo(8, 25);
    ctx.closePath();
    ctx.fill();
  } else if (sticker === "question") {
    ctx.translate(x, y);
    ctx.scale(scaleFactor, scaleFactor);
    ctx.rotate(0.12);
    ctx.font = '900 160px "Anton", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.shadowColor = "rgba(255, 0, 0, 0.8)";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 16;
    ctx.strokeText("?", 0, 0);

    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#FFE600";
    ctx.fillText("?", 0, 0);
  } else if (sticker === "circle") {
    ctx.translate(x, y);
    ctx.scale(scaleFactor, scaleFactor);
    ctx.strokeStyle = "#FF1E1E";
    ctx.lineWidth = 12;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.ellipse(0, 0, 110, 80, -0.15, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 4;
    ctx.shadowColor = "transparent";
    ctx.stroke();
  } else if (sticker === "vs") {
    ctx.translate(x, y);
    ctx.scale(scaleFactor, scaleFactor);
    ctx.rotate(-0.08);

    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(0, 0, 75, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#FFE600";
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.font = '900 78px "Anton", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 8;
    ctx.strokeText("VS", 0, 2);
    ctx.fillStyle = "#FF1E1E";
    ctx.fillText("VS", 0, 2);
  } else if (sticker === "badge_100") {
    ctx.translate(x, y);
    ctx.scale(scaleFactor, scaleFactor);
    ctx.rotate(-0.1);

    ctx.font = '900 110px "Anton", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 16;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 12;
    ctx.strokeText("100", 0, -10);

    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#FF1E1E";
    ctx.fillText("100", 0, -10);

    ctx.strokeStyle = "#FF1E1E";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-70, 42);
    ctx.lineTo(70, 42);
    ctx.stroke();
  }

  ctx.restore();
}

function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  config: CanvasConfig,
  width: number,
  height: number,
) {
  ctx.save();

  // Calculate coordinates based on position preset
  let x = width / 2;
  let y = height * 0.82;

  if (config.textPosition === "top") {
    y = height * 0.22;
  } else if (config.textPosition === "center") {
    y = height * 0.5;
  } else if (config.textPosition === "bottom-left") {
    x = width * 0.32;
    y = height * 0.8;
  } else if (config.textPosition === "bottom-right") {
    x = width * 0.68;
    y = height * 0.8;
  } else if (config.textPosition === "custom") {
    if (config.textCustomX !== undefined) {
      x = (config.textCustomX / 100) * width;
    }
    if (config.textCustomY !== undefined) {
      y = (config.textCustomY / 100) * height;
    }
  }

  ctx.translate(x, y);
  const angleRad = (config.rotationAngle * Math.PI) / 180;
  ctx.rotate(angleRad);

  // Configure typography
  ctx.font = `900 ${config.fontSize}px "${config.fontFamily}", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "miter";
  ctx.miterLimit = 2;

  // Multi-line split
  const lines = config.text.split("\n");
  const lineHeight = config.fontSize * 1.08;
  const startY = -((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, index) => {
    const lineY = startY + index * lineHeight;

    // Pass 1: Drop Shadow + Stroke Outline
    if (config.strokeWidth > 0 && config.strokeColor !== "transparent") {
      ctx.shadowColor = config.shadowColor;
      ctx.shadowBlur = config.shadowBlur;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 6;
      ctx.strokeStyle = config.strokeColor;
      ctx.lineWidth = config.strokeWidth;
      ctx.strokeText(line, 0, lineY);
    }

    // Pass 2: Clean crisp Fill
    ctx.shadowColor = config.strokeWidth > 0 ? "transparent" : config.shadowColor;
    ctx.shadowBlur = config.strokeWidth > 0 ? 0 : config.shadowBlur;
    ctx.fillStyle = config.textColor;
    ctx.fillText(line, 0, lineY);
  });

  ctx.restore();
}
