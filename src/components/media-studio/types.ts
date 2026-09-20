export type CanvasFontFamily = "Anton" | "Bangers" | "Montserrat" | "Inter" | "Poppins";
export type CanvasStickerType = "none" | "arrow" | "question" | "circle" | "vs" | "badge_100";
export type TextPositionPreset = "top" | "center" | "bottom" | "bottom-left" | "bottom-right" | "custom";
export type AspectRatio = "16:9" | "1:1" | "4:5" | "9:16";

export interface AspectRatioDimension {
  width: number;
  height: number;
  label: string;
  sublabel: string;
}

export const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, AspectRatioDimension> = {
  "16:9": {
    width: 1280,
    height: 720,
    label: "16:9",
    sublabel: "YouTube / X Landscape",
  },
  "1:1": {
    width: 1080,
    height: 1080,
    label: "1:1",
    sublabel: "Instagram / X Square",
  },
  "4:5": {
    width: 1080,
    height: 1350,
    label: "4:5",
    sublabel: "Instagram Portrait",
  },
  "9:16": {
    width: 1080,
    height: 1920,
    label: "9:16",
    sublabel: "Shorts / Reels / TikTok",
  },
};

export interface CanvasConfig {
  version: number;
  text: string;
  fontFamily: CanvasFontFamily;
  fontSize: number;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  rotationAngle: number;
  textPosition: TextPositionPreset;
  textCustomX?: number;
  textCustomY?: number;
  sticker: CanvasStickerType;
  stickerPosition: "left" | "right" | "center";
  overlayVignette: boolean;
  brightness: number; // -50 to 50
  contrast: number; // -50 to 50
  aspectRatio: AspectRatio;
}

export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  version: 1,
  text: "SECRET FORMULA",
  fontFamily: "Anton",
  fontSize: 96,
  textColor: "#FFE600",
  strokeColor: "#000000",
  strokeWidth: 14,
  shadowColor: "rgba(0,0,0,0.85)",
  shadowBlur: 18,
  rotationAngle: -6,
  textPosition: "bottom",
  textCustomX: 50,
  textCustomY: 82,
  sticker: "arrow",
  stickerPosition: "right",
  overlayVignette: true,
  brightness: 0,
  contrast: 0,
  aspectRatio: "16:9",
};

export type PresetName = "mrbeast" | "shock" | "vs" | "clean" | "minimal" | "cyber";

export interface StylePreset {
  id: PresetName;
  name: string;
  description: string;
  config: Partial<CanvasConfig>;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "mrbeast",
    name: "MrBeast High-CTR",
    description: "Vibrant yellow font, thick black stroke, dynamic tilt & red arrow",
    config: {
      fontFamily: "Anton",
      textColor: "#FFE600",
      strokeColor: "#000000",
      strokeWidth: 16,
      rotationAngle: -7,
      sticker: "arrow",
      stickerPosition: "right",
      overlayVignette: true,
      shadowColor: "rgba(0,0,0,0.9)",
      shadowBlur: 20,
    },
  },
  {
    id: "shock",
    name: "Shock & Curiosity",
    description: "Bangers comic typography with glowing question mark",
    config: {
      fontFamily: "Bangers",
      textColor: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 14,
      rotationAngle: -4,
      sticker: "question",
      stickerPosition: "right",
      overlayVignette: true,
      shadowColor: "rgba(239,68,68,0.7)",
      shadowBlur: 24,
    },
  },
  {
    id: "vs",
    name: "Showdown / VS",
    description: "Comparison badge with bold red text and crisp white border",
    config: {
      fontFamily: "Anton",
      textColor: "#FF2A2A",
      strokeColor: "#FFFFFF",
      strokeWidth: 10,
      rotationAngle: 0,
      sticker: "vs",
      stickerPosition: "center",
      overlayVignette: true,
      shadowColor: "rgba(0,0,0,0.85)",
      shadowBlur: 16,
    },
  },
  {
    id: "clean",
    name: "Clean Modern",
    description: "Sleek Montserrat typography, subtle stroke for tech & business",
    config: {
      fontFamily: "Montserrat",
      textColor: "#FFFFFF",
      strokeColor: "#0A0A0A",
      strokeWidth: 5,
      rotationAngle: 0,
      sticker: "none",
      overlayVignette: true,
      shadowColor: "rgba(0,0,0,0.6)",
      shadowBlur: 12,
    },
  },
  {
    id: "cyber",
    name: "Neon Cyber",
    description: "Electric cyan with deep violet glow and 100 badge",
    config: {
      fontFamily: "Anton",
      textColor: "#00F0FF",
      strokeColor: "#000000",
      strokeWidth: 14,
      rotationAngle: -3,
      sticker: "badge_100",
      stickerPosition: "right",
      overlayVignette: true,
      shadowColor: "rgba(168,85,247,0.85)",
      shadowBlur: 22,
    },
  },
  {
    id: "minimal",
    name: "Minimalist Hero",
    description: "Pure bold white text without stickers for aesthetic feeds",
    config: {
      fontFamily: "Inter",
      textColor: "#FFFFFF",
      strokeColor: "transparent",
      strokeWidth: 0,
      rotationAngle: 0,
      sticker: "none",
      overlayVignette: true,
      shadowColor: "rgba(0,0,0,0.9)",
      shadowBlur: 14,
    },
  },
];
