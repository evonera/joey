'use client';

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  VisualCanvas,
  type VisualCanvasHandle,
} from "./VisualCanvas";
import {
  DEFAULT_CANVAS_CONFIG,
  STYLE_PRESETS,
  ASPECT_RATIO_DIMENSIONS,
  type CanvasConfig,
  type CanvasFontFamily,
  type CanvasStickerType,
  type AspectRatio,
  type PresetName,
} from "./types";
import { FeedSimulator } from "./FeedSimulator";
import { lintPackaging } from "@/lib/packaging-linter";
import { AssetPickerDialog } from "@/components/assets/asset-picker-dialog";
import { saveMediaStudioAsset, generateVisualHookSuggestions, type VisualConceptSuggestion } from "@/app/actions/media-studio";
import {
  SparklesIcon,
  Loading03Icon as Loader2,
  Image01Icon as ImageIcon,
  Upload01Icon as Upload,
  Tick01Icon as Check,
  Download01Icon as Download,
  FloppyDiskIcon as Save,
  TextIcon,
  FilterIcon as Palette,
  Settings01Icon as Sliders,
  ViewIcon as Eye,
  SentIcon as Send,
} from "hugeicons-react";

export interface MediaStudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postContent?: string;
  initialImageUrl?: string | null;
  onAttachToPost?: (imageUrl: string, packagingScore: number) => void;
  onSavedAsset?: (assetUrl: string) => void;
}

export function MediaStudioDialog({
  open,
  onOpenChange,
  postContent = "",
  initialImageUrl = null,
  onAttachToPost,
  onSavedAsset,
}: MediaStudioDialogProps) {
  const canvasRef = useRef<VisualCanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Canvas configuration
  const [config, setConfig] = useState<CanvasConfig>(() => ({
    ...DEFAULT_CANVAS_CONFIG,
    text: postContent ? postContent.slice(0, 24).toUpperCase() : DEFAULT_CANVAS_CONFIG.text,
  }));

  // Background state
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(initialImageUrl);
  const [solidColor, setSolidColor] = useState("#0c0a09");
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);

  // Asset picker modal
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  // Active tab in controls
  const [activeTab, setActiveTab] = useState<"typography" | "stickers" | "background" | "presets" | "feed">("typography");

  // AI suggestions
  const [aiSuggestions, setAiSuggestions] = useState<VisualConceptSuggestion[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Track whether the user has manually changed the overlay text
  const hasUserEditedText = useRef(false);

  // Auto-seed hook text from post content on first open (only if user hasn't edited yet)
  useEffect(() => {
    if (postContent && !hasUserEditedText.current) {
      const words = postContent.trim().split(/\s+/).slice(0, 3).join(" ").toUpperCase();
      if (words) {
        setConfig((prev) => ({ ...prev, text: words }));
      }
    }
  }, [postContent]);

  const updateConfig = (patch: Partial<CanvasConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  // Live packaging lint
  const packagingLint = lintPackaging(postContent || config.text, config.text);

  // Apply style preset
  const applyPreset = (presetName: PresetName) => {
    const preset = STYLE_PRESETS.find((p) => p.id === presetName);
    if (preset) {
      updateConfig(preset.config);
      toast.success(`Applied ${preset.name} style`);
    }
  };

  // Fetch AI Hook Suggestions
  const handleFetchAiSuggestions = async () => {
    setLoadingAi(true);
    try {
      const res = await generateVisualHookSuggestions(postContent || config.text);
      setAiSuggestions(res.suggestions);
      toast.success("Generated viral hook suggestions!");
    } catch {
      toast.error("Couldn’t fetch AI suggestions. Using defaults.");
    } finally {
      setLoadingAi(false);
    }
  };

  // Local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setBgImageUrl(dataUrl);
        toast.success("Background image loaded!");
      }
    };
    reader.readAsDataURL(file);
  };

  // 1-Click Download
  const handleDownload = async () => {
    const handle = canvasRef.current;
    if (!handle) return;
    try {
      const blob = await handle.exportBlob(0.92);
      if (!blob) {
        toast.error("Could not capture image from canvas");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `joey-visual-hook-${config.aspectRatio.replace(":", "x")}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Downloaded high-res image!");
    } catch (err: any) {
      toast.error("Download failed: " + err.message);
    }
  };

  // Save to Joey Assets library
  const handleSaveToAssets = async () => {
    const handle = canvasRef.current;
    if (!handle) return;
    setIsSaving(true);
    try {
      const dataUrl = await handle.exportDataUrl(0.92);
      if (!dataUrl) throw new Error("Could not export canvas data");

      const dim = ASPECT_RATIO_DIMENSIONS[config.aspectRatio];
      const res = await saveMediaStudioAsset({
        base64Data: dataUrl,
        filename: `visual-hook-${Date.now()}.jpg`,
        width: dim.width,
        height: dim.height,
      });

      if (!res.success || !res.publicUrl) {
        throw new Error(res.error || "Save failed");
      }

      onSavedAsset?.(res.publicUrl);
      toast.success("Saved visual hook to Joey Assets!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save asset");
    } finally {
      setIsSaving(false);
    }
  };

  // Attach directly to post in Compose
  const handleAttachToPost = async () => {
    const handle = canvasRef.current;
    if (!handle) return;
    setIsSaving(true);
    try {
      const dataUrl = await handle.exportDataUrl(0.92);
      if (!dataUrl) throw new Error("Could not export canvas data");

      const dim = ASPECT_RATIO_DIMENSIONS[config.aspectRatio];
      const res = await saveMediaStudioAsset({
        base64Data: dataUrl,
        filename: `visual-hook-${Date.now()}.jpg`,
        width: dim.width,
        height: dim.height,
      });

      if (!res.success || !res.publicUrl) {
        throw new Error(res.error || "Failed to persist visual hook to storage for post attachment");
      }

      if (onAttachToPost) {
        onAttachToPost(res.publicUrl, packagingLint.score);
      }
      toast.success("Attached visual hook to post!");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to attach graphic");
    } finally {
      setIsSaving(false);
    }
  };

  const currentDim = ASPECT_RATIO_DIMENSIONS[config.aspectRatio];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background text-foreground border-border">
        {/* Header */}
        <DialogHeader className="p-4 sm:px-6 border-b border-border flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <SparklesIcon className="h-5 w-5 text-primary" />
              Joey Media Studio & Packaging Linter
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Design viral text-overlay cards, test feed truncation, and optimize headline-visual synergy.
            </DialogDescription>
          </div>

          {/* Quick Score Badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs font-mono font-bold ${
                packagingLint.score >= 80
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : packagingLint.score >= 55
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-red-500/15 text-red-400 border-red-500/30"
              }`}
            >
              Synergy: {packagingLint.score}/100
            </Badge>
          </div>
        </DialogHeader>

        {/* Studio Workspace: 2-Column Split */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* Left Column: Canvas Preview & Quick Action Bar (7 cols) */}
          <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-border bg-muted/10 overflow-y-auto space-y-4">
            {/* Top Toolbar: Aspect Ratio Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border text-xs">
                {(["16:9", "1:1", "4:5", "9:16"] as AspectRatio[]).map((ar) => (
                  <button
                    key={ar}
                    type="button"
                    onClick={() => updateConfig({ aspectRatio: ar })}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      config.aspectRatio === ar
                        ? "bg-background text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {ar}
                  </button>
                ))}
              </div>

              <span className="text-[11px] text-muted-foreground font-mono">
                {currentDim.width} × {currentDim.height} ({currentDim.sublabel})
              </span>
            </div>

            {/* Canvas Container with dynamic aspect-ratio container */}
            <div className="flex-1 flex items-center justify-center min-h-[260px] max-h-[460px] p-2 bg-black/40 rounded-xl border border-border/60 overflow-hidden">
              <div
                className="max-w-full max-h-full flex items-center justify-center transition-all duration-200"
                style={{
                  aspectRatio:
                    config.aspectRatio === "16:9"
                      ? "16/9"
                      : config.aspectRatio === "1:1"
                        ? "1/1"
                        : config.aspectRatio === "4:5"
                          ? "4/5"
                          : "9/16",
                  height: config.aspectRatio === "9:16" ? "420px" : "auto",
                  width: config.aspectRatio === "16:9" ? "100%" : "auto",
                }}
              >
                <VisualCanvas
                  ref={canvasRef}
                  config={config}
                  imageUrl={bgImageUrl}
                  solidColor={solidColor}
                  onRendered={setRenderedUrl}
                  className="max-w-full max-h-[420px] rounded-lg shadow-2xl object-contain block"
                />
              </div>
            </div>

            {/* Quick Presets Bar */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                1-Click Viral Styles
              </span>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_PRESETS.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(p.id)}
                    className="h-7 text-xs font-medium bg-background/50 hover:bg-muted"
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Bottom Actions Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="text-xs gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Download JPEG
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveToAssets}
                  disabled={isSaving}
                  className="text-xs gap-1.5"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save to Assets
                </Button>

                {onAttachToPost && (
                  <Button
                    size="sm"
                    onClick={handleAttachToPost}
                    disabled={isSaving}
                    className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Attach to Post
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Customization Controls & Linter Tabs (5 cols) */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-hidden bg-background">
            <Tabs
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as any)}
              className="flex flex-col h-full"
            >
              {/* Tabs Navigation Header */}
              <div className="px-4 pt-3 border-b border-border">
                <TabsList className="grid grid-cols-4 w-full h-8 text-xs">
                  <TabsTrigger value="typography" className="text-[11px] gap-1 px-1.5">
                    <TextIcon className="h-3 w-3" />
                    Text
                  </TabsTrigger>
                  <TabsTrigger value="stickers" className="text-[11px] gap-1 px-1.5">
                    <Palette className="h-3 w-3" />
                    Stickers
                  </TabsTrigger>
                  <TabsTrigger value="background" className="text-[11px] gap-1 px-1.5">
                    <ImageIcon className="h-3 w-3" />
                    Background
                  </TabsTrigger>
                  <TabsTrigger value="feed" className="text-[11px] gap-1 px-1.5">
                    <Eye className="h-3 w-3" />
                    Simulate
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Scrollable Tabs Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 1. Typography & Hook Tab */}
                <TabsContent value="typography" className="m-0 space-y-4">
                  {/* Hook Text Input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">
                        Overlay Headline (1–3 Words)
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleFetchAiSuggestions}
                        disabled={loadingAi}
                        className="h-6 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/10 px-2"
                      >
                        {loadingAi ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <SparklesIcon className="h-3 w-3" />
                        )}
                        AI Hook Ideas
                      </Button>
                    </div>

                    <Textarea
                      value={config.text}
                      onChange={(e) => {
                        hasUserEditedText.current = true;
                        updateConfig({ text: e.target.value });
                      }}
                      placeholder="e.g. SECRET FORMULA"
                      rows={2}
                      className="text-sm font-bold tracking-tight resize-none"
                    />
                  </div>

                  {/* AI Suggestions Chips */}
                  {aiSuggestions.length > 0 && (
                    <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                      <span className="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                        <SparklesIcon className="h-3 w-3" />
                        Suggested Hook Combinations
                      </span>
                      <div className="flex flex-col gap-1.5">
                        {aiSuggestions.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              updateConfig({
                                text: s.text,
                                sticker: s.sticker,
                              });
                              applyPreset(s.preset);
                            }}
                            className="text-left rounded-md p-1.5 bg-background border border-border hover:border-primary/50 text-xs transition-colors"
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span>{s.text}</span>
                              <Badge variant="outline" className="text-[10px] uppercase font-mono">
                                {s.preset}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{s.explanation}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Font Family & Size */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Font Family</label>
                      <select
                        aria-label="Font Family"
                        value={config.fontFamily}
                        onChange={(e) => updateConfig({ fontFamily: e.target.value as CanvasFontFamily })}
                        className="w-full h-8 text-xs rounded-md border border-input bg-background px-2 font-medium"
                      >
                        <option value="Anton">Anton (Bold Viral)</option>
                        <option value="Bangers">Bangers (Comic Shock)</option>
                        <option value="Montserrat">Montserrat (Modern Clean)</option>
                        <option value="Inter">Inter (Minimal Tech)</option>
                        <option value="Poppins">Poppins (Standard Brand)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">Size: {config.fontSize}px</span>
                      </div>
                      <Slider
                        value={[config.fontSize]}
                        onValueChange={([val]) => updateConfig({ fontSize: val })}
                        min={44}
                        max={160}
                        step={2}
                      />
                    </div>
                  </div>

                  {/* Colors: Text, Stroke & Shadow */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">Text Color</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          aria-label="Text Color"
                          type="color"
                          value={config.textColor}
                          onChange={(e) => updateConfig({ textColor: e.target.value })}
                          className="h-7 w-7 rounded cursor-pointer border border-border p-0.5 bg-background"
                        />
                        <span className="text-[11px] font-mono text-muted-foreground uppercase">{config.textColor}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">Stroke Color</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          aria-label="Stroke Color"
                          type="color"
                          value={config.strokeColor}
                          onChange={(e) => updateConfig({ strokeColor: e.target.value })}
                          className="h-7 w-7 rounded cursor-pointer border border-border p-0.5 bg-background"
                        />
                        <span className="text-[11px] font-mono text-muted-foreground uppercase">{config.strokeColor}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">Stroke Width</label>
                      <Slider
                        value={[config.strokeWidth]}
                        onValueChange={([val]) => updateConfig({ strokeWidth: val })}
                        min={0}
                        max={28}
                        step={1}
                        className="pt-2"
                      />
                    </div>
                  </div>

                  {/* Dynamic Tilt & Position */}
                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>Dynamic Tilt: {config.rotationAngle}°</span>
                    </div>
                    <Slider
                      value={[config.rotationAngle]}
                      onValueChange={([val]) => updateConfig({ rotationAngle: val })}
                      min={-20}
                      max={20}
                      step={1}
                    />
                  </div>

                  {/* Text Position Presets */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-semibold text-foreground">Position Preset</label>
                    <div className="grid grid-cols-5 gap-1 text-xs">
                      {(["top", "center", "bottom", "bottom-left", "bottom-right"] as const).map((pos) => (
                        <Button
                          key={pos}
                          variant={config.textPosition === pos ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateConfig({ textPosition: pos })}
                          className="h-7 text-[11px] px-1 capitalize"
                        >
                          {pos.replace("-", " ")}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* 2. Stickers & Visual FX Tab */}
                <TabsContent value="stickers" className="m-0 space-y-4">
                  {/* Sticker Picker */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">High-CTR Viral Sticker</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "none", label: "None" },
                        { id: "arrow", label: "Pointing Arrow" },
                        { id: "question", label: "Question Mark" },
                        { id: "circle", label: "Highlight Circle" },
                        { id: "vs", label: "VS Showdown" },
                        { id: "badge_100", label: "100 Score" },
                      ].map((item) => (
                        <Button
                          key={item.id}
                          variant={config.sticker === item.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateConfig({ sticker: item.id as CanvasStickerType })}
                          className="h-8 text-xs font-medium justify-center"
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Sticker Position */}
                  {config.sticker !== "none" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Sticker Placement</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["left", "center", "right"] as const).map((pos) => (
                          <Button
                            key={pos}
                            variant={config.stickerPosition === pos ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateConfig({ stickerPosition: pos })}
                            className="h-7 text-xs capitalize"
                          >
                            {pos}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vignette Toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/20">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-foreground">Dark Vignette Gradient</span>
                      <p className="text-[11px] text-muted-foreground">
                        Ensures high text contrast over busy background visuals
                      </p>
                    </div>
                    <input
                      aria-label="Vignette gradient"
                      type="checkbox"
                      checked={config.overlayVignette}
                      onChange={(e) => updateConfig({ overlayVignette: e.target.checked })}
                      className="h-4 w-4 rounded accent-primary cursor-pointer"
                    />
                  </div>

                  {/* Brightness & Contrast */}
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Brightness</span>
                        <span className="font-mono">{config.brightness}%</span>
                      </div>
                      <Slider
                        value={[config.brightness]}
                        onValueChange={([val]) => updateConfig({ brightness: val })}
                        min={-50}
                        max={50}
                        step={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Contrast</span>
                        <span className="font-mono">{config.contrast}%</span>
                      </div>
                      <Slider
                        value={[config.contrast]}
                        onValueChange={([val]) => updateConfig({ contrast: val })}
                        min={-50}
                        max={50}
                        step={2}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 3. Background Source Tab */}
                <TabsContent value="background" className="m-0 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Background Image</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 text-xs gap-1.5"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload Image
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAssetPickerOpen(true)}
                        className="h-8 text-xs gap-1.5"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        Pick from Assets
                      </Button>
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      aria-label="Upload background file"
                    />
                  </div>

                  {/* Clear Image or Solid Color */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">Fallback Solid / Gradient Color</label>
                      {bgImageUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setBgImageUrl(null)}
                          className="h-6 text-[11px] text-destructive hover:bg-destructive/10"
                        >
                          Remove Image
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        aria-label="Fallback solid color"
                        type="color"
                        value={solidColor}
                        onChange={(e) => setSolidColor(e.target.value)}
                        className="h-8 w-8 rounded border border-border p-0.5 bg-background cursor-pointer"
                      />
                      <span className="text-xs font-mono text-muted-foreground">{solidColor}</span>
                    </div>
                  </div>
                </TabsContent>

                {/* 4. Feed Simulator & Linter Tab */}
                <TabsContent value="feed" className="m-0 space-y-3">
                  <FeedSimulator
                    mediaUrl={renderedUrl}
                    postText={postContent || config.text}
                    overlayText={config.text}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>

        {/* Asset Picker Modal */}
        <AssetPickerDialog
          open={assetPickerOpen}
          onOpenChange={setAssetPickerOpen}
          onSelect={(urls) => {
            if (urls.length > 0) {
              setBgImageUrl(urls[0]);
              toast.success("Applied image from Assets!");
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
