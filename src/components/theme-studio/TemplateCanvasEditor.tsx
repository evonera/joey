"use client";

import * as React from "react";
import { 
  IconDeviceFloppy, 
  IconSparkles, 
  IconEye, 
  IconTypography, 
  IconPalette, 
  IconPhoto,
  IconLoader2,
  IconCheck,
  IconCircleCheck,
  IconArrowRight,
  IconBrandInstagram
} from "@tabler/icons-react";
import { createThemeTemplate, updateThemeTemplate } from "@/app/actions/theme-templates";
import { checkR2Status } from "@/app/actions/assets";
import { toast } from "sonner";

interface TemplateData {
  id?: string;
  themePageId?: string | null;
  name: string;
  formatId: string;
  renderer: "puppeteer" | "remotion";
  componentSpec: {
    backgroundColor?: string;
    backgroundGradient?: string;
    bgImageUrl?: string;
    bgType?: "photo" | "solid" | "gradient";
    textColor?: string;
    accentColor?: string;
    fontFamily?: string;
    titleSize?: number;
    bodySize?: number;
    showWatermark?: boolean;
    watermarkText?: string;
    showSlideIndicator?: boolean;
    padding?: number;
    borderRadius?: number;
    titleTemplate?: string;
    bodyTemplate?: string;
    topBadge?: "yellow_logo" | "swipe_pill" | "tag_pill" | "none";
    brandInitial?: string;
    showDivider?: boolean;
    pipInsetUrl?: string;
    highlightWords?: string[];
    watermarkBackdropText?: string;
  };
  propsSchema?: Record<string, unknown> | null;
  format?: {
    slug: string;
    name: string;
    platform: string;
    mediaType: string;
    aspectRatio?: string | null;
  } | null;
}

interface TemplateCanvasEditorProps {
  themePageId?: string;
  initialTemplate: TemplateData;
  availableFormats: Array<{
    id: string;
    slug: string;
    name: string;
    mediaType: string;
    aspectRatio?: string | null;
  }>;
}

function interpolateTemplate(template: string | undefined, data: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => data[key] ?? `{{${key}}}`);
}

function renderHighlightedText(text: string, highlightWords?: string[], accentColor = "#ffe633") {
  if (!highlightWords || highlightWords.length === 0) return text;
  const validWords = highlightWords.map((w) => w.trim()).filter(Boolean);
  if (validWords.length === 0) return text;

  const escaped = validWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(\\b(?:${escaped.join("|")})\\b)`, "gi");
  const parts = text.split(regex);

  return parts.map((part, i) => {
    const isMatch = validWords.some((w) => w.toLowerCase() === part.toLowerCase());
    if (isMatch) {
      return (
        <span key={i} style={{ color: accentColor }} className="font-extrabold">
          {part}
        </span>
      );
    }
    return part;
  });
}

const PHOTO_PRESETS = [
  {
    label: "🏏 Cricket Stadium",
    url: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=1200&auto=format&fit=crop",
  },
  {
    label: "⚽ Football Lights",
    url: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=1200&auto=format&fit=crop",
  },
  {
    label: "🏀 Basketball Arena",
    url: "https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=1200&auto=format&fit=crop",
  },
  {
    label: "🎬 Cinema & Pop",
    url: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop",
  },
  {
    label: "🤖 Tech / Future",
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop",
  },
  {
    label: "🐻 Viral Nature",
    url: "https://images.unsplash.com/photo-1534567153574-2b12153a87f0?q=80&w=1200&auto=format&fit=crop",
  },
];

const PIP_PRESETS = [
  {
    label: "Player Reaction",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop",
  },
  {
    label: "Speaker / Expert",
    url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
  },
];

const GRADIENT_PRESETS = [
  { name: "Pubity Midnight", value: "linear-gradient(180deg, #181716 0%, #0a0908 100%)" },
  { name: "Deep Indigo", value: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)" },
  { name: "Emerald Glow", value: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)" },
  { name: "Amber Dark", value: "linear-gradient(135deg, #451a03 0%, #0a0908 100%)" },
];

export function TemplateCanvasEditor({
  themePageId,
  initialTemplate,
  availableFormats,
}: TemplateCanvasEditorProps) {
  const [name, setName] = React.useState(initialTemplate.name || "Pubity Breaking News Template");
  const [formatId, setFormatId] = React.useState(
    initialTemplate.formatId || availableFormats[0]?.id || ""
  );

  const [spec, setSpec] = React.useState(initialTemplate.componentSpec || {
    backgroundColor: "#0a0908",
    bgType: "photo",
    bgImageUrl: PHOTO_PRESETS[0].url,
    textColor: "#ffffff",
    accentColor: "#ffe633",
    fontFamily: "Inter, sans-serif",
    titleSize: 28,
    bodySize: 15,
    showWatermark: true,
    watermarkText: "@PubityCricket",
    showSlideIndicator: true,
    padding: 32,
    borderRadius: 16,
    titleTemplate: "{{title}}",
    bodyTemplate: "{{summary}}",
    topBadge: "yellow_logo",
    brandInitial: "🅟",
    showDivider: true,
    highlightWords: ["RECORD", "HISTORIC", "VICTORY", "SMASHES"],
    watermarkBackdropText: "PUBITY",
  });

  const [bgMode, setBgMode] = React.useState<"photo" | "gradient" | "solid">(
    (spec.bgType as any) || (spec.bgImageUrl ? "photo" : spec.backgroundGradient ? "gradient" : "solid")
  );

  const [previewSample, setPreviewSample] = React.useState({
    title: "Virat Kohli Smashes Historic Record in Thrilling World Cup Victory",
    summary: "A masterclass in run chasing seals victory in Mumbai as milestone records tumble before a packed stadium crowd.",
    source_name: "ESPN Cricinfo",
    author: "Sports Desk",
    tag: "BREAKING NEWS",
    date: new Date().toLocaleDateString(),
  });

  const [highlightInput, setHighlightInput] = React.useState(
    (spec.highlightWords || ["RECORD", "HISTORIC", "VICTORY", "SMASHES"]).join(", ")
  );

  const [activeTab, setActiveTab] = React.useState<"design" | "content">("design");
  const [activeSlide, setActiveSlide] = React.useState<1 | 2 | 3>(1);
  const [saving, setSaving] = React.useState(false);
  const [r2Configured, setR2Configured] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    checkR2Status()
      .then((res) => setR2Configured(res.isConfigured))
      .catch(() => setR2Configured(false));
  }, []);

  const selectedFormat = availableFormats.find((f) => f.id === formatId) || availableFormats[0];
  const isPortrait = selectedFormat?.aspectRatio === "4:5";
  const isVertical = selectedFormat?.aspectRatio === "9:16";
  const isCarousel = selectedFormat?.slug?.includes("carousel") || name.toLowerCase().includes("carousel");

  function applyPreset(presetType: "pubity_hero" | "pubity_carousel" | "sports_spotlight" | "dark_minimal") {
    if (presetType === "pubity_hero") {
      setName("Pubity Breaking News Hero");
      setBgMode("photo");
      setSpec((prev) => ({
        ...prev,
        bgType: "photo",
        bgImageUrl: PHOTO_PRESETS[0].url,
        backgroundColor: "#0a0908",
        accentColor: "#ffe633",
        textColor: "#ffffff",
        topBadge: "yellow_logo",
        brandInitial: "🅟",
        showDivider: true,
        pipInsetUrl: undefined,
        titleSize: 28,
        bodySize: 15,
        highlightWords: ["RECORD", "HISTORIC", "VICTORY", "SMASHES"],
        watermarkBackdropText: "PUBITY",
      }));
      setHighlightInput("RECORD, HISTORIC, VICTORY, SMASHES");
      setPreviewSample({
        title: "Virat Kohli Smashes Historic Record in Thrilling World Cup Victory",
        summary: "A masterclass in run chasing seals victory in Mumbai as milestone records tumble before a packed stadium crowd.",
        source_name: "ESPN Cricinfo",
        author: "Sports Desk",
        tag: "BREAKING NEWS",
        date: new Date().toLocaleDateString(),
      });
      setActiveSlide(1);
      toast.success("Applied Pubity Breaking Hero template");
    } else if (presetType === "pubity_carousel") {
      setName("Pubity Multi-Slide Carousel");
      setBgMode("photo");
      setSpec((prev) => ({
        ...prev,
        bgType: "photo",
        bgImageUrl: PHOTO_PRESETS[3].url,
        backgroundColor: "#0a0908",
        accentColor: "#ffe633",
        textColor: "#ffffff",
        topBadge: "swipe_pill",
        brandInitial: "🅟",
        showDivider: true,
        pipInsetUrl: PIP_PRESETS[0].url,
        titleSize: 27,
        bodySize: 15,
        highlightWords: ["EVERYTHING", "SURPRISE", "UNVEILED", "FIRST"],
        watermarkBackdropText: "PUBITY",
      }));
      setHighlightInput("EVERYTHING, SURPRISE, UNVEILED, FIRST");
      setPreviewSample({
        title: "Everything Unveiled in the Historic World Tour Reveal",
        summary: "From secret stadium rehearsals to surprise guest appearances, swipe through for the full breakdown.",
        source_name: "Pubity Entertainment",
        author: "Pubity Desk",
        tag: "DEEP DIVE",
        date: new Date().toLocaleDateString(),
      });
      toast.success("Applied Pubity Carousel template");
    } else if (presetType === "sports_spotlight") {
      setName("Sports Match Spotlight");
      setBgMode("photo");
      setSpec((prev) => ({
        ...prev,
        bgType: "photo",
        bgImageUrl: PHOTO_PRESETS[1].url,
        backgroundColor: "#0a0908",
        accentColor: "#ffe633",
        textColor: "#ffffff",
        topBadge: "tag_pill",
        brandInitial: "🅟",
        showDivider: true,
        pipInsetUrl: PIP_PRESETS[1].url,
        titleSize: 28,
        bodySize: 15,
        highlightWords: ["STUNNING", "CHAMPIONS", "FINAL"],
        watermarkBackdropText: "PUBITY",
      }));
      setHighlightInput("STUNNING, CHAMPIONS, FINAL");
      setPreviewSample({
        title: "Stunning Late Equalizer Crowns Champions in Epic Final",
        summary: "An unbelievable turnaround in stoppage time sends the home arena into absolute pandemonium.",
        source_name: "ESPN Live",
        author: "Match Centre",
        tag: "MATCH HIGHLIGHT",
        date: new Date().toLocaleDateString(),
      });
      toast.success("Applied Sports Spotlight template");
    } else {
      setName("Dark Editorial Minimal");
      setBgMode("solid");
      setSpec((prev) => ({
        ...prev,
        bgType: "solid",
        backgroundColor: "#0a0908",
        accentColor: "#ffe633",
        textColor: "#f8fafc",
        topBadge: "none",
        brandInitial: "🅟",
        showDivider: false,
        pipInsetUrl: undefined,
        titleSize: 26,
        bodySize: 15,
        highlightWords: ["ARCHITECTURE", "AUTONOMOUS", "FUTURE"],
        watermarkBackdropText: "JOEY",
      }));
      setHighlightInput("ARCHITECTURE, AUTONOMOUS, FUTURE");
      setPreviewSample({
        title: "The Architecture of Autonomous Multi-Agent Social Networks",
        summary: "Why deterministic guardrails and branch-first execution are redefining autonomous content distribution.",
        source_name: "Joey Dispatch",
        author: "Editorial",
        tag: "ANALYSIS",
        date: new Date().toLocaleDateString(),
      });
      toast.success("Applied Dark Editorial Minimal template");
    }
  }

  async function handleSave() {
    setSaving(true);
    const parsedHighlights = highlightInput
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);

    const finalSpec = {
      ...spec,
      bgType: bgMode,
      bgImageUrl: bgMode === "photo" ? spec.bgImageUrl : undefined,
      backgroundGradient: bgMode === "gradient" ? spec.backgroundGradient : undefined,
      highlightWords: parsedHighlights,
    };

    try {
      if (initialTemplate.id) {
        const res = await updateThemeTemplate(initialTemplate.id, {
          name,
          formatId,
          renderer: selectedFormat?.mediaType === "video" ? "remotion" : "puppeteer",
          componentSpec: finalSpec,
        });
        if (res.error) throw new Error(res.error);
        toast.success("Template updated");
      } else {
        const res = await createThemeTemplate({
          themePageId: themePageId || undefined,
          name,
          formatId,
          renderer: selectedFormat?.mediaType === "video" ? "remotion" : "puppeteer",
          componentSpec: finalSpec,
        });
        if (res.error) throw new Error(res.error);
        toast.success("New template saved");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  function insertToken(token: string, target: "title" | "body") {
    if (target === "title") {
      setSpec((prev) => ({
        ...prev,
        titleTemplate: (prev.titleTemplate || "") + ` {{${token}}}`,
      }));
    } else {
      setSpec((prev) => ({
        ...prev,
        bodyTemplate: (prev.bodyTemplate || "") + ` {{${token}}}`,
      }));
    }
  }

  const activeHighlights = highlightInput
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Top Header & Save */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xl font-bold bg-transparent border-b border-dashed border-muted-foreground/30 hover:border-primary focus:border-primary focus:outline-none pb-0.5"
            />
            {r2Configured === true ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Cloudflare R2 Connected
              </span>
            ) : (
              <span
                title="Images are served via direct URLs and Exa news search hero images. Configure R2 credentials in .env.local if bucket uploads are required."
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Direct URLs & Exa Active (R2 Optional)
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Format: <span className="font-semibold text-foreground">{selectedFormat?.name}</span> ({selectedFormat?.aspectRatio || "1:1"})
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-md disabled:opacity-50"
        >
          {saving ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconDeviceFloppy className="w-4 h-4" />}
          Save Template
        </button>
      </div>

      {/* Preset Selector Bar */}
      <div className="p-4 border rounded-2xl bg-card space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <IconSparkles className="w-3.5 h-3.5 text-amber-500" /> Curated Pubity & Editorial Presets
          </span>
          <span className="text-[11px] text-muted-foreground">1-click apply high-retention layout</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => applyPreset("pubity_hero")}
            className="p-3 border rounded-xl text-left bg-muted/20 hover:bg-primary/5 hover:border-primary/40 transition-colors"
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <span className="text-amber-500 font-extrabold">🅟</span> Pubity Breaking
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Photo scrim, yellow monogram shield, impact title</p>
          </button>
          <button
            type="button"
            onClick={() => applyPreset("pubity_carousel")}
            className="p-3 border rounded-xl text-left bg-muted/20 hover:bg-primary/5 hover:border-primary/40 transition-colors"
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <span className="text-amber-500">📑</span> 3-Slide Carousel
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Frosted SWIPE pill, PIP circle, watermark outro</p>
          </button>
          <button
            type="button"
            onClick={() => applyPreset("sports_spotlight")}
            className="p-3 border rounded-xl text-left bg-muted/20 hover:bg-primary/5 hover:border-primary/40 transition-colors"
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <span className="text-amber-500">🏏</span> Sports Spotlight
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Action photo, PIP reaction circle, stat highlights</p>
          </button>
          <button
            type="button"
            onClick={() => applyPreset("dark_minimal")}
            className="p-3 border rounded-xl text-left bg-muted/20 hover:bg-primary/5 hover:border-primary/40 transition-colors"
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <span className="text-amber-500">🖤</span> Dark Minimal
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Subtle dark elegance with neon amber highlights</p>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left / Settings Sidebar (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab("design")}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "design"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <IconPalette className="w-3.5 h-3.5" /> Style & Visuals
              </span>
            </button>
            <button
              onClick={() => setActiveTab("content")}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "content"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <IconTypography className="w-3.5 h-3.5" /> Copy & Tokens
              </span>
            </button>
          </div>

          {activeTab === "design" ? (
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-muted-foreground mb-1">Target Format</label>
                <select
                  value={formatId}
                  onChange={(e) => setFormatId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg bg-background"
                >
                  {availableFormats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.aspectRatio || "1:1"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Background Mode Toggle */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-medium text-muted-foreground">Background Type</label>
                  <div className="inline-flex rounded-md border p-0.5 bg-muted/30 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        setBgMode("photo");
                        setSpec((prev) => ({ ...prev, bgType: "photo" }));
                      }}
                      className={`px-2 py-0.5 rounded font-medium transition-colors ${
                        bgMode === "photo" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                      }`}
                    >
                      Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBgMode("solid");
                        setSpec((prev) => ({ ...prev, bgType: "solid" }));
                      }}
                      className={`px-2 py-0.5 rounded font-medium transition-colors ${
                        bgMode === "solid" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                      }`}
                    >
                      Solid
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBgMode("gradient");
                        setSpec((prev) => ({
                          ...prev,
                          bgType: "gradient",
                          backgroundGradient: prev.backgroundGradient || GRADIENT_PRESETS[0].value,
                        }));
                      }}
                      className={`px-2 py-0.5 rounded font-medium transition-colors ${
                        bgMode === "gradient" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                      }`}
                    >
                      Gradient
                    </button>
                  </div>
                </div>

                {bgMode === "photo" && (
                  <div className="space-y-2.5 p-3 border rounded-xl bg-card">
                    <label className="block text-[11px] font-medium text-muted-foreground">Background Image URL</label>
                    <input
                      type="text"
                      value={spec.bgImageUrl || ""}
                      onChange={(e) => setSpec({ ...spec, bgImageUrl: e.target.value })}
                      placeholder="https://images.unsplash.com/..."
                      className="w-full px-2.5 py-1.5 text-xs border rounded-lg font-mono bg-background"
                    />
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase">Curated Photo Presets:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {PHOTO_PRESETS.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setSpec({ ...spec, bgImageUrl: p.url })}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                              spec.bgImageUrl === p.url
                                ? "bg-primary/10 border-primary text-primary font-bold"
                                : "hover:bg-muted text-muted-foreground"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {bgMode === "solid" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={spec.backgroundColor || "#0a0908"}
                      onChange={(e) => setSpec({ ...spec, backgroundColor: e.target.value })}
                      className="w-8 h-8 rounded border cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={spec.backgroundColor || "#0a0908"}
                      onChange={(e) => setSpec({ ...spec, backgroundColor: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border rounded font-mono"
                    />
                  </div>
                )}

                {bgMode === "gradient" && (
                  <div className="space-y-2">
                    <select
                      value={spec.backgroundGradient || GRADIENT_PRESETS[0].value}
                      onChange={(e) => setSpec({ ...spec, backgroundGradient: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border rounded-lg bg-background"
                    >
                      {GRADIENT_PRESETS.map((p) => (
                        <option key={p.name} value={p.value}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={spec.backgroundGradient || ""}
                      onChange={(e) => setSpec({ ...spec, backgroundGradient: e.target.value })}
                      placeholder="linear-gradient(...)"
                      className="w-full px-2 py-1 text-[11px] border rounded font-mono text-muted-foreground"
                    />
                  </div>
                )}
              </div>

              {/* Top Badge & Brand Mark */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">Top Badge Style</label>
                  <select
                    value={spec.topBadge || "yellow_logo"}
                    onChange={(e) => setSpec({ ...spec, topBadge: e.target.value as any })}
                    className="w-full px-3 py-1.5 text-xs border rounded-lg bg-background"
                  >
                    <option value="yellow_logo">Yellow Logo Shield (🅟)</option>
                    <option value="swipe_pill">Frosted SWIPE Pill</option>
                    <option value="tag_pill">Category Tag Pill</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">Brand Initial Mark</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={spec.brandInitial || "🅟"}
                    onChange={(e) => setSpec({ ...spec, brandInitial: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border rounded-lg text-center font-bold"
                  />
                </div>
              </div>

              {/* Hairline Divider & Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">Accent (Yellow)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={spec.accentColor || "#ffe633"}
                      onChange={(e) => setSpec({ ...spec, accentColor: e.target.value })}
                      className="w-8 h-8 rounded border cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={spec.accentColor || "#ffe633"}
                      onChange={(e) => setSpec({ ...spec, accentColor: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border rounded font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">Text Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={spec.textColor || "#ffffff"}
                      onChange={(e) => setSpec({ ...spec, textColor: e.target.value })}
                      className="w-8 h-8 rounded border cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={spec.textColor || "#ffffff"}
                      onChange={(e) => setSpec({ ...spec, textColor: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border rounded font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="canvasShowDivider"
                  checked={spec.showDivider ?? true}
                  onChange={(e) => setSpec({ ...spec, showDivider: e.target.checked })}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label htmlFor="canvasShowDivider" className="text-xs font-medium cursor-pointer">
                  Show signature hairline divider with mark ({`— ${spec.brandInitial || "🅟"} —`})
                </label>
              </div>

              {/* Picture-in-Picture (PIP) Circle */}
              <div className="p-3 border rounded-xl bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-medium text-muted-foreground">Circular Inset (PIP)</label>
                  {spec.pipInsetUrl && (
                    <button
                      type="button"
                      onClick={() => setSpec({ ...spec, pipInsetUrl: undefined })}
                      className="text-[10px] text-muted-foreground hover:text-destructive"
                    >
                      Clear Inset
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={spec.pipInsetUrl || ""}
                  onChange={(e) => setSpec({ ...spec, pipInsetUrl: e.target.value })}
                  placeholder="https://... (Optional player or speaker inset)"
                  className="w-full px-2.5 py-1 text-[11px] border rounded font-mono"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-semibold">Presets:</span>
                  {PIP_PRESETS.map((pip) => (
                    <button
                      key={pip.label}
                      type="button"
                      onClick={() => setSpec({ ...spec, pipInsetUrl: pip.url })}
                      className={`px-2 py-0.5 rounded text-[10px] border ${
                        spec.pipInsetUrl === pip.url ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"
                      }`}
                    >
                      {pip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Watermark Handle */}
              <div>
                <label className="block font-medium text-muted-foreground mb-1">Watermark Handle</label>
                <input
                  type="text"
                  value={spec.watermarkText || ""}
                  onChange={(e) => setSpec({ ...spec, watermarkText: e.target.value })}
                  placeholder="@yourbrand"
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5 text-xs">
              {/* Yellow Highlight Keywords */}
              <div className="space-y-2 p-3.5 border rounded-xl bg-amber-500/5 border-amber-500/20">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-foreground flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Yellow Highlight Keywords
                  </label>
                  <span className="text-[10px] text-muted-foreground">Comma-separated</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Pubity&apos;s signature look highlights punchy words in neon yellow (`#ffe633`).
                </p>
                <input
                  type="text"
                  value={highlightInput}
                  onChange={(e) => setHighlightInput(e.target.value)}
                  placeholder="RECORD, HISTORIC, SURPASSES, VICTORY"
                  className="w-full px-3 py-1.5 text-xs border rounded-lg bg-background font-mono font-semibold text-amber-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-medium text-muted-foreground">Title Template</label>
                  <span className="text-[10px] text-muted-foreground">Interpolates in live preview</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {["title", "tag", "source_name", "author"].map((tok) => (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => insertToken(tok, "title")}
                      className="px-2 py-0.5 bg-secondary hover:bg-primary/20 text-secondary-foreground font-mono text-[10px] rounded transition-colors"
                      title={`Insert {{${tok}}} into title`}
                    >
                      + {`{{${tok}}}`}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  value={spec.titleTemplate || "{{title}}"}
                  onChange={(e) => setSpec({ ...spec, titleTemplate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono bg-background"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-medium text-muted-foreground">Body Text Template</label>
                  <span className="text-[10px] text-muted-foreground">Interpolates in live preview</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {["summary", "source_name", "author", "date"].map((tok) => (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => insertToken(tok, "body")}
                      className="px-2 py-0.5 bg-secondary hover:bg-primary/20 text-secondary-foreground font-mono text-[10px] rounded transition-colors"
                      title={`Insert {{${tok}}} into body`}
                    >
                      + {`{{${tok}}}`}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={spec.bodyTemplate || "{{summary}}"}
                  onChange={(e) => setSpec({ ...spec, bodyTemplate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">
                    Title Size: {spec.titleSize || 28}px
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={44}
                    value={spec.titleSize || 28}
                    onChange={(e) => setSpec({ ...spec, titleSize: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">
                    Body Size: {spec.bodySize || 15}px
                  </label>
                  <input
                    type="range"
                    min={12}
                    max={22}
                    value={spec.bodySize || 15}
                    onChange={(e) => setSpec({ ...spec, bodySize: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right / Live Artboard Preview (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center p-8 bg-muted/30 border rounded-2xl">
          <div className="w-full flex items-center justify-between mb-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <IconEye className="w-4 h-4" /> Live High-Fidelity Canvas
            </div>

            {/* Carousel Slide Switcher */}
            <div className="inline-flex rounded-lg border p-0.5 bg-background shadow-xs text-xs">
              <button
                type="button"
                onClick={() => setActiveSlide(1)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  activeSlide === 1 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Slide 1 (Cover)
              </button>
              <button
                type="button"
                onClick={() => setActiveSlide(2)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  activeSlide === 2 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Slide 2 (Detail/PIP)
              </button>
              <button
                type="button"
                onClick={() => setActiveSlide(3)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  activeSlide === 3 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Slide 3 (Outro CTA)
              </button>
            </div>
          </div>

          {/* Canvas Card Mockup */}
          <div
            style={{
              backgroundColor: spec.backgroundColor || "#0a0908",
              borderRadius: `${spec.borderRadius || 16}px`,
              aspectRatio: isVertical ? "9/16" : isPortrait ? "4/5" : "1/1",
              maxWidth: isVertical ? "330px" : isPortrait ? "380px" : "420px",
              width: "100%",
            }}
            className="shadow-2xl flex flex-col justify-between relative overflow-hidden select-none transition-all duration-300 border border-white/10"
          >
            {/* Background Image / Gradient */}
            {bgMode === "photo" && spec.bgImageUrl && (
              <img
                src={spec.bgImageUrl}
                alt="Background"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
            )}

            {bgMode === "gradient" && spec.backgroundGradient && (
              <div
                style={{ background: spec.backgroundGradient }}
                className="absolute inset-0 pointer-events-none"
              />
            )}

            {/* Pubity-style Multi-stop Dark Gradient Contrast Scrim */}
            <div
              style={{
                background:
                  bgMode === "photo"
                    ? "linear-gradient(180deg, rgba(10,9,8,0.2) 0%, rgba(10,9,8,0.45) 45%, rgba(10,9,8,0.88) 78%, rgba(10,9,8,0.98) 100%)"
                    : undefined,
              }}
              className="absolute inset-0 pointer-events-none"
            />

            {/* Slide 3: Outro Massive Watermark Backdrop */}
            {activeSlide === 3 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-15 overflow-hidden">
                <span className="text-8xl font-black tracking-tighter text-white uppercase select-none rotate-[-12deg]">
                  {spec.watermarkBackdropText || "PUBITY"}
                </span>
              </div>
            )}

            {/* Top Bar: Badges & Handles */}
            <div className="relative z-10 p-6 flex items-start justify-between gap-2">
              {/* Top Badge */}
              {spec.topBadge === "yellow_logo" && (
                <div className="w-10 h-10 rounded-full bg-[#ffe633] text-[#0a0908] flex items-center justify-center font-black text-xl shadow-lg border-2 border-white/20">
                  {spec.brandInitial || "🅟"}
                </div>
              )}

              {spec.topBadge === "swipe_pill" && (
                <div className="px-3.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold tracking-wider flex items-center gap-1 shadow-md">
                  SWIPE <IconArrowRight className="w-3.5 h-3.5 text-[#ffe633]" />
                </div>
              )}

              {spec.topBadge === "tag_pill" && (
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#ffe633] text-[#0a0908] shadow-md">
                  {previewSample.tag}
                </span>
              )}

              {spec.topBadge === "none" && <div />}

              {/* Source attribution & Slide number */}
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md text-white/90 text-[11px] font-semibold border border-white/10">
                  {previewSample.source_name}
                </span>
                <span className="px-2 py-1 rounded-full bg-black/50 backdrop-blur-md text-white/80 text-[11px] font-mono border border-white/10">
                  {activeSlide}/3
                </span>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="relative z-10 px-6 pb-6 pt-2 flex flex-col justify-end space-y-3">
              {/* Slide 1: Cover View */}
              {activeSlide === 1 && (
                <>
                  <h2
                    style={{
                      fontSize: `${spec.titleSize || 28}px`,
                      color: spec.textColor || "#ffffff",
                      lineHeight: 1.22,
                    }}
                    className="font-extrabold tracking-tight drop-shadow-md"
                  >
                    {renderHighlightedText(
                      interpolateTemplate(spec.titleTemplate || "{{title}}", previewSample),
                      activeHighlights,
                      spec.accentColor || "#ffe633"
                    )}
                  </h2>

                  {spec.showDivider && (
                    <div className="flex items-center gap-3 py-1 opacity-85">
                      <div className="h-[1px] bg-white/30 flex-1" />
                      <span className="text-[#ffe633] text-xs font-black tracking-widest">
                        {spec.brandInitial || "🅟"}
                      </span>
                      <div className="h-[1px] bg-white/30 flex-1" />
                    </div>
                  )}

                  <p
                    style={{
                      fontSize: `${spec.bodySize || 15}px`,
                      color: spec.textColor || "#ffffff",
                      lineHeight: 1.45,
                    }}
                    className="opacity-90 font-medium line-clamp-3 drop-shadow-sm"
                  >
                    {interpolateTemplate(spec.bodyTemplate || "{{summary}}", previewSample)}
                  </p>
                </>
              )}

              {/* Slide 2: Inset / Detail View */}
              {activeSlide === 2 && (
                <div className="space-y-4">
                  {spec.pipInsetUrl && (
                    <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md p-2 rounded-2xl border border-white/15">
                      <img
                        src={spec.pipInsetUrl}
                        alt="PIP Inset"
                        className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-lg shrink-0"
                      />
                      <div className="text-white text-xs">
                        <span className="block font-bold text-[#ffe633]">Spotlight Reaction</span>
                        <span className="text-white/80 text-[11px] leading-tight">Key post-match commentary and field statistics</span>
                      </div>
                    </div>
                  )}

                  <h3
                    style={{
                      fontSize: `${(spec.titleSize || 28) - 4}px`,
                      color: spec.textColor || "#ffffff",
                      lineHeight: 1.25,
                    }}
                    className="font-bold tracking-tight"
                  >
                    {renderHighlightedText(
                      "Key turning points in this historic matchup",
                      activeHighlights,
                      spec.accentColor || "#ffe633"
                    )}
                  </h3>

                  <p
                    style={{
                      fontSize: `${spec.bodySize || 15}px`,
                      color: spec.textColor || "#ffffff",
                    }}
                    className="opacity-90 leading-relaxed font-normal"
                  >
                    {interpolateTemplate(spec.bodyTemplate || "{{summary}}", previewSample)}
                  </p>
                </div>
              )}

              {/* Slide 3: Outro CTA View */}
              {activeSlide === 3 && (
                <div className="text-center py-6 space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[#ffe633] text-[#0a0908] flex items-center justify-center font-black text-3xl shadow-2xl border-4 border-white">
                    {spec.brandInitial || "🅟"}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">Follow For Daily Updates</h3>
                    <p className="text-xs text-white/80 mt-1">Join millions of fans for breaking stories & instant highlights</p>
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/30 text-white font-mono text-xs">
                    {spec.watermarkText || "@Pubity"}
                  </div>
                </div>
              )}

              {/* Bottom Watermark & Carousel Dots */}
              <div className="pt-3 border-t border-white/15 flex items-center justify-between text-xs text-white/80">
                <span className="font-semibold tracking-wide flex items-center gap-1.5">
                  <span className="text-[#ffe633] font-bold">{spec.brandInitial || "🅟"}</span>
                  {spec.watermarkText || "@PubityCricket"}
                </span>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full transition-all ${
                      activeSlide === 1 ? "bg-[#ffe633] w-4" : "bg-white/40"
                    }`}
                  />
                  <span
                    className={`w-2 h-2 rounded-full transition-all ${
                      activeSlide === 2 ? "bg-[#ffe633] w-4" : "bg-white/40"
                    }`}
                  />
                  <span
                    className={`w-2 h-2 rounded-full transition-all ${
                      activeSlide === 3 ? "bg-[#ffe633] w-4" : "bg-white/40"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
