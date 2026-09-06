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
  IconBrandInstagram,
  IconBrandX,
  IconVideo,
  IconPlayerPlay,
  IconVolume,
  IconVolumeOff,
  IconLayoutGrid,
} from "@tabler/icons-react";
import { createThemeTemplate, updateThemeTemplate } from "@/app/actions/theme-templates";
import { checkR2Status } from "@/app/actions/assets";
import { CURATED_MEME_CLIPS, MemeClip, searchMemeClips } from "@/lib/theme-studio/assets/meme-clips";
import { toast } from "sonner";

interface TemplateData {
  id?: string;
  themePageId?: string | null;
  name: string;
  formatId: string;
  renderer: "puppeteer" | "remotion";
  componentSpec: {
    templateFamily?: "pubity_hero" | "morning_brew_cyan" | "pubity_carousel" | "tweet_card" | "tweet_grid4" | "video_reel" | "mixed_carousel";
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
    topBadge?: "yellow_logo" | "swipe_pill" | "tag_pill" | "circular_seal" | "none";
    brandInitial?: string;
    showDivider?: boolean;
    pipInsetUrl?: string;
    highlightWords?: string[];
    watermarkBackdropText?: string;
    videoUrl?: string;
    memeClipId?: string;
    mediaUrls?: string[];
    mediaLayout?: "single" | "2-column" | "4-grid" | "none";
    tweetAuthor?: {
      name: string;
      handle: string;
      avatarUrl?: string;
      isVerified?: boolean;
    };
    quotedTweet?: {
      author: {
        name: string;
        handle: string;
        avatarUrl?: string;
        isVerified?: boolean;
      };
      content: string;
      mediaUrl?: string;
    };
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

  const [activeTab, setActiveTab] = React.useState<"design" | "content" | "clips">("design");
  const [activeSlide, setActiveSlide] = React.useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = React.useState(false);
  const [r2Configured, setR2Configured] = React.useState<boolean | null>(null);
  const [clipSearch, setClipSearch] = React.useState("");
  const [clipCategory, setClipCategory] = React.useState<"all" | "reaction" | "gaming_loop" | "streamer">("all");
  const [videoMuted, setVideoMuted] = React.useState(true);

  React.useEffect(() => {
    checkR2Status()
      .then((res) => setR2Configured(res.isConfigured))
      .catch(() => setR2Configured(false));
  }, []);

  const selectedFormat = availableFormats.find((f) => f.id === formatId) || availableFormats[0];
  const isPortrait = selectedFormat?.aspectRatio === "4:5";
  const isVertical = selectedFormat?.aspectRatio === "9:16" || spec.templateFamily === "video_reel";
  const isCarousel = selectedFormat?.slug?.includes("carousel") || name.toLowerCase().includes("carousel") || spec.templateFamily === "pubity_carousel" || spec.templateFamily === "mixed_carousel";

  function applyPreset(presetType: "pubity_hero" | "morning_brew_cyan" | "pubity_carousel" | "tweet_card" | "tweet_grid4" | "video_reel" | "mixed_carousel" | "sports_spotlight" | "dark_minimal") {
    if (presetType === "pubity_hero") {
      setName("Pubity Breaking News Hero");
      setBgMode("photo");
      setSpec((prev) => ({
        ...prev,
        templateFamily: "pubity_hero",
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
    } else if (presetType === "morning_brew_cyan") {
      setName("Morning Brew Cyan Edition");
      setBgMode("photo");
      setSpec((prev) => ({
        ...prev,
        templateFamily: "morning_brew_cyan",
        bgType: "photo",
        bgImageUrl: PHOTO_PRESETS[5].url,
        backgroundColor: "#030712",
        accentColor: "#00e5ff",
        textColor: "#ffffff",
        topBadge: "circular_seal",
        brandInitial: "M",
        showDivider: true,
        pipInsetUrl: undefined,
        titleSize: 30,
        bodySize: 15,
        highlightWords: ["BEAR", "COYOTE", "URBAN", "LOVABLE", "SURGE"],
        watermarkBackdropText: "MORNING BREW",
      }));
      setHighlightInput("BEAR, COYOTE, URBAN, LOVABLE, SURGE");
      setPreviewSample({
        title: "Urban Wildlife Encounters Surge in Record Historic Suburban Migration",
        summary: "State rangers report unprecedented wildlife behavior across national corridors as urban fringe sightings triple.",
        source_name: "Morning Brew Daily",
        author: "Trends Desk",
        tag: "OFFICIAL REPORT",
        date: new Date().toLocaleDateString(),
      });
      setActiveSlide(1);
      toast.success("Applied Morning Brew Cyan template");
    } else if (presetType === "pubity_carousel") {
      setName("Pubity Multi-Slide Carousel");
      setBgMode("photo");
      setSpec((prev) => ({
        ...prev,
        templateFamily: "pubity_carousel",
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
    } else if (presetType === "tweet_card") {
      setName("Twitter / X Single Post & Media");
      setBgMode("solid");
      setSpec((prev) => ({
        ...prev,
        templateFamily: "tweet_card",
        bgType: "solid",
        backgroundColor: "#000000",
        accentColor: "#1d9bf0",
        textColor: "#ffffff",
        mediaLayout: "single",
        tweetAuthor: {
          name: "Daily Loud",
          handle: "@DailyLoud",
          avatarUrl: PIP_PRESETS[0].url,
          isVerified: true,
        },
        quotedTweet: {
          author: {
            name: "Pop Base",
            handle: "@PopBase",
            avatarUrl: PIP_PRESETS[1].url,
            isVerified: true,
          },
          content: "This remains one of the most unpredictable cultural phenomena of the entire year.",
        },
        titleSize: 24,
        bodySize: 15,
      }));
      setPreviewSample({
        title: "The sheer velocity of autonomous social platforms is shattering every prior retention record in 2026.",
        summary: "Live tests reveal automated content clustering drives 4.8x higher repeat impressions.",
        source_name: "X Trending",
        author: "Tech Reporter",
        tag: "VIRAL POST",
        date: new Date().toLocaleDateString(),
      });
      toast.success("Applied Twitter / X Post template");
    } else if (presetType === "tweet_grid4") {
      setName("Twitter / X 4-Grid Meme Collage");
      setBgMode("solid");
      setSpec((prev) => ({
        ...prev,
        templateFamily: "tweet_grid4",
        bgType: "solid",
        backgroundColor: "#000000",
        accentColor: "#1d9bf0",
        textColor: "#ffffff",
        mediaLayout: "4-grid",
        mediaUrls: [
          PHOTO_PRESETS[0].url,
          PHOTO_PRESETS[1].url,
          PHOTO_PRESETS[2].url,
          PHOTO_PRESETS[3].url,
        ],
        tweetAuthor: {
          name: "Cinema & Culture",
          handle: "@cinemac物を",
          avatarUrl: PIP_PRESETS[0].url,
          isVerified: true,
        },
        quotedTweet: {
          author: {
            name: "Acme Reviews",
            handle: "@acme_corp",
            isVerified: true,
          },
          content: "Top-right by far, nothing else comes remotely close.",
        },
        titleSize: 22,
        bodySize: 14,
      }));
      setPreviewSample({
        title: "Which cinematic world are you choosing to survive in for 30 consecutive days?",
        summary: "Cast your vote below and debate in the replies.",
        source_name: "X Discussions",
        author: "Poll Host",
        tag: "DEBATE",
        date: new Date().toLocaleDateString(),
      });
      toast.success("Applied Twitter / X 4-Grid Meme template");
    } else if (presetType === "video_reel") {
      const memeClip = CURATED_MEME_CLIPS[0];
      setName("Vertical 9:16 Video Meme Reel");
      setBgMode("solid");
      setSpec((prev) => ({
        ...prev,
        templateFamily: "video_reel",
        bgType: "solid",
        backgroundColor: "#000000",
        accentColor: "#ffe633",
        textColor: "#ffffff",
        videoUrl: memeClip.videoUrl,
        memeClipId: memeClip.id,
        titleSize: 26,
        bodySize: 14,
        topBadge: "none",
        watermarkText: "@JoeyReels",
      }));
      setPreviewSample({
        title: "They were really filming scenes like this with zero CGI in mind...",
        summary: "Watch closely at the camera movement in the final three seconds.",
        source_name: "Viral Video Archive",
        author: "Curator",
        tag: "WATCH TILL END",
        date: new Date().toLocaleDateString(),
      });
      toast.success("Applied Vertical Video Meme Reel template");
    } else if (presetType === "mixed_carousel") {
      const memeClip = CURATED_MEME_CLIPS[1];
      setName("Mixed Media 4-Slide Carousel");
      setBgMode("photo");
      setSpec((prev) => ({
        ...prev,
        templateFamily: "mixed_carousel",
        bgType: "photo",
        bgImageUrl: PHOTO_PRESETS[0].url,
        videoUrl: memeClip.videoUrl,
        memeClipId: memeClip.id,
        backgroundColor: "#0a0908",
        accentColor: "#ffe633",
        textColor: "#ffffff",
        topBadge: "swipe_pill",
        brandInitial: "🅟",
        showDivider: true,
        titleSize: 28,
        bodySize: 15,
        highlightWords: ["UNEXPECTED", "STUNNING", "REVEALED", "TURNING POINT"],
        watermarkBackdropText: "PUBITY",
      }));
      setHighlightInput("UNEXPECTED, STUNNING, REVEALED, TURNING POINT");
      setPreviewSample({
        title: "Unexpected Turning Point Stuns Entire Arena in Final Seconds",
        summary: "Slide 1 provides the background context, Slide 2 shows the live reaction video clip.",
        source_name: "Sports Central",
        author: "Live Desk",
        tag: "EXCLUSIVE",
        date: new Date().toLocaleDateString(),
      });
      toast.success("Applied Mixed Media Carousel template");
    } else if (presetType === "sports_spotlight") {
      setName("Sports Match Spotlight");
      setBgMode("photo");
      setSpec((prev) => ({
        ...prev,
        templateFamily: "pubity_hero",
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
            <IconSparkles className="w-3.5 h-3.5 text-amber-500" /> Viral Template Families & Formats
          </span>
          <span className="text-[11px] text-muted-foreground">1-click switch between high-retention formats</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <button
            type="button"
            onClick={() => applyPreset("pubity_hero")}
            className={`p-2.5 border rounded-xl text-left transition-colors ${
              spec.templateFamily === "pubity_hero" ? "bg-primary/10 border-primary" : "bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1">
              <span className="text-amber-500 font-extrabold">🅟</span> Pubity Hero
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Yellow shield & hairline divider</p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("morning_brew_cyan")}
            className={`p-2.5 border rounded-xl text-left transition-colors ${
              spec.templateFamily === "morning_brew_cyan" ? "bg-[#00e5ff]/10 border-[#00e5ff]" : "bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1 text-[#00e5ff]">
              <span>☕</span> Morning Brew
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Cyan seal & — M — divider</p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("pubity_carousel")}
            className={`p-2.5 border rounded-xl text-left transition-colors ${
              spec.templateFamily === "pubity_carousel" ? "bg-primary/10 border-primary" : "bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1">
              <span className="text-amber-500">📑</span> 4-Slide Deck
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Cover, PIP, points, outro CTA</p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("tweet_card")}
            className={`p-2.5 border rounded-xl text-left transition-colors ${
              spec.templateFamily === "tweet_card" ? "bg-sky-500/10 border-sky-500" : "bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1 text-sky-400">
              <IconBrandX className="w-3.5 h-3.5" /> Single Post
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Media & quote-tweet reply</p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("tweet_grid4")}
            className={`p-2.5 border rounded-xl text-left transition-colors ${
              spec.templateFamily === "tweet_grid4" ? "bg-sky-500/10 border-sky-500" : "bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1 text-sky-400">
              <IconLayoutGrid className="w-3.5 h-3.5" /> 4-Grid Collage
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">2x2 comparison meme</p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("video_reel")}
            className={`p-2.5 border rounded-xl text-left transition-colors ${
              spec.templateFamily === "video_reel" ? "bg-purple-500/10 border-purple-500" : "bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1 text-purple-400">
              <IconVideo className="w-3.5 h-3.5" /> 9:16 Meme Reel
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Hook text & center video</p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("mixed_carousel")}
            className={`p-2.5 border rounded-xl text-left transition-colors ${
              spec.templateFamily === "mixed_carousel" ? "bg-emerald-500/10 border-emerald-500" : "bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1 text-emerald-400">
              <span>🔀</span> Mixed Media
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Card cover + video clip</p>
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
            <button
              onClick={() => setActiveTab("clips")}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "clips"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <IconVideo className="w-3.5 h-3.5 text-purple-400" /> Meme & Video Clips
              </span>
            </button>
          </div>

          {activeTab === "design" && (
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
          )}

          {activeTab === "content" && (
            <div className="space-y-5 text-xs">
              {/* Highlight Keywords */}
              <div className="space-y-2 p-3.5 border rounded-xl bg-amber-500/5 border-amber-500/20">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-foreground flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Highlight Keywords
                  </label>
                  <span className="text-[10px] text-muted-foreground">Comma-separated</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Signature high-retention look highlights punchy words in your accent color ({spec.accentColor || "#ffe633"}).
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

          {activeTab === "clips" && (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 border rounded-xl bg-purple-500/5 border-purple-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-foreground flex items-center gap-1.5">
                    <IconVideo className="w-4 h-4 text-purple-400" /> Viral Meme & Video Clip Library
                  </label>
                  <span className="text-[10px] text-muted-foreground">High Retention</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Curated viral reaction memes and hypnotic background loops for Reels, TikTok, and Mixed Carousels.
                </p>
                <input
                  type="text"
                  value={clipSearch}
                  onChange={(e) => setClipSearch(e.target.value)}
                  placeholder="Search Homelander, Pedro Pascal, Subway Surfers, GTA..."
                  className="w-full px-3 py-1.5 text-xs border rounded-lg bg-background font-medium"
                />
                {/* Category Pills */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {(["all", "reaction", "gaming_loop", "streamer"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setClipCategory(cat)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                        clipCategory === cat
                          ? "bg-purple-500 text-white border-purple-500"
                          : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {cat === "all" ? "All Formats" : cat.replace("_", " ").toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clip Cards List */}
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {searchMemeClips(clipSearch)
                  .filter((clip) => clipCategory === "all" || clip.category === clipCategory)
                  .map((clip) => {
                    const isSelected = spec.videoUrl === clip.videoUrl;
                    return (
                      <div
                        key={clip.id}
                        className={`p-2.5 border rounded-xl flex items-center gap-3 transition-colors ${
                          isSelected ? "bg-purple-500/10 border-purple-500 shadow-sm" : "bg-card hover:bg-muted/30"
                        }`}
                      >
                        <div className="relative w-20 h-14 rounded-lg overflow-hidden shrink-0 bg-black/60 border border-white/10">
                          <img
                            src={clip.thumbnailUrl}
                            alt={clip.title}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-1 right-1 px-1 py-0.2 bg-black/80 text-white text-[9px] font-mono rounded">
                            {clip.durationSeconds}s
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs truncate">{clip.title}</span>
                            <span className="px-1.5 py-0.2 text-[9px] rounded uppercase font-semibold bg-muted text-muted-foreground shrink-0">
                              {clip.aspectRatio}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                            {clip.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSpec((prev) => ({
                                  ...prev,
                                  videoUrl: clip.videoUrl,
                                  memeClipId: clip.id,
                                  templateFamily: prev.templateFamily === "mixed_carousel" ? "mixed_carousel" : "video_reel",
                                }));
                                toast.success(`Attached "${clip.title}" to template`);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                isSelected
                                  ? "bg-purple-500 text-white"
                                  : "bg-primary/10 text-primary hover:bg-primary/20"
                              }`}
                            >
                              {isSelected ? "Active on Canvas" : "Select Clip"}
                            </button>
                            {clip.attribution && (
                              <span className="text-[9px] text-muted-foreground truncate">
                                {clip.attribution}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

            {/* Slide Switcher for Carousels or Format Badge */}
            {isCarousel ? (
              <div className="inline-flex rounded-lg border p-0.5 bg-background shadow-xs text-xs">
                <button
                  type="button"
                  onClick={() => setActiveSlide(1)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    activeSlide === 1 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Slide 1 (Cover)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide(2)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    activeSlide === 2 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Slide 2 {spec.templateFamily === "mixed_carousel" ? "(Video)" : "(Detail)"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide(3)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    activeSlide === 3 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Slide 3 (Points)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide(4)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    activeSlide === 4 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Slide 4 (Outro)
                </button>
              </div>
            ) : (
              <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                {spec.templateFamily === "video_reel" ? "🎬 9:16 Video Reel" : spec.templateFamily?.includes("tweet") ? "🐦 X Screenshot" : "🅟 Branded Post"}
              </span>
            )}
          </div>

          {/* Canvas Card Mockup */}
          {spec.templateFamily === "video_reel" ? (
            /* Vertical 9:16 Video Meme Reel Canvas */
            <div
              style={{
                backgroundColor: "#000000",
                borderRadius: `${spec.borderRadius || 20}px`,
                aspectRatio: "9/16",
                maxWidth: "340px",
                width: "100%",
              }}
              className="shadow-2xl flex flex-col justify-between p-6 relative overflow-hidden select-none border border-white/15"
            >
              {/* Top Reel Hook */}
              <div className="space-y-3 text-center pt-4">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-white text-[11px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE REEL HOOK
                </div>
                <h2
                  style={{
                    fontSize: `${spec.titleSize || 26}px`,
                    color: spec.textColor || "#ffffff",
                    lineHeight: 1.25,
                  }}
                  className="font-extrabold tracking-tight drop-shadow-md text-center"
                >
                  {renderHighlightedText(
                    interpolateTemplate(spec.titleTemplate || "{{title}}", previewSample),
                    activeHighlights,
                    spec.accentColor || "#ffe633"
                  )}
                </h2>
              </div>

              {/* Center Embedded Video Player */}
              <div className="w-full relative aspect-video bg-black/90 rounded-xl overflow-hidden border border-white/20 shadow-2xl my-auto flex items-center justify-center">
                {spec.videoUrl ? (
                  <video
                    src={spec.videoUrl}
                    autoPlay
                    loop
                    muted={videoMuted}
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-white/50 text-xs">
                    <IconVideo className="w-8 h-8 text-white/40" />
                    <span>Select clip from Meme Library</span>
                  </div>
                )}

                {/* Audio Toggle Cue */}
                <button
                  type="button"
                  onClick={() => setVideoMuted(!videoMuted)}
                  className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white text-[10px] font-bold flex items-center gap-1 hover:bg-black/90 transition-colors"
                >
                  {videoMuted ? <IconVolumeOff className="w-3 h-3 text-red-400" /> : <IconVolume className="w-3 h-3 text-emerald-400" />}
                  {videoMuted ? "MUTED" : "SOUND ON"}
                </button>
              </div>

              {/* Bottom Reel Footer */}
              <div className="text-center space-y-1.5 pb-2">
                <span className="text-xs font-semibold text-white/70 font-mono">
                  {spec.watermarkText || "@JoeyReels"}
                </span>
                <p className="text-[10px] font-bold tracking-widest text-[#ffe633] uppercase">
                  TAP FOR NEXT REEL
                </p>
              </div>
            </div>
          ) : spec.templateFamily === "tweet_card" || spec.templateFamily === "tweet_grid4" ? (
            /* Twitter / X Post Canvas */
            <div
              style={{
                backgroundColor: "#000000",
                borderRadius: `${spec.borderRadius || 16}px`,
                aspectRatio: isPortrait ? "4/5" : "1/1",
                maxWidth: isPortrait ? "390px" : "420px",
                width: "100%",
              }}
              className="shadow-2xl flex flex-col justify-between p-6 relative overflow-hidden select-none border border-neutral-800 text-white"
            >
              {/* Tweet Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-neutral-800 overflow-hidden border border-white/10 shrink-0">
                    <img
                      src={PIP_PRESETS[0].url}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-sm text-white">Daily Loud</span>
                      <span className="w-4 h-4 rounded-full bg-[#1d9bf0] flex items-center justify-center text-[10px] text-white">
                        ✓
                      </span>
                    </div>
                    <span className="text-xs text-neutral-400 font-mono">@DailyLoud · Today</span>
                  </div>
                </div>
                <IconBrandX className="w-5 h-5 text-neutral-400" />
              </div>

              {/* Tweet Main Text */}
              <div className="my-3">
                <p className="text-sm text-white font-normal leading-relaxed">
                  {interpolateTemplate(spec.titleTemplate || "{{title}}", previewSample)}
                </p>
              </div>

              {/* Media Container */}
              {spec.templateFamily === "tweet_grid4" ? (
                /* 4-Grid Collage */
                <div className="grid grid-cols-2 gap-1.5 rounded-xl overflow-hidden my-2 border border-neutral-800">
                  <img src={PHOTO_PRESETS[0].url} alt="Grid 1" className="w-full h-24 object-cover" />
                  <img src={PHOTO_PRESETS[1].url} alt="Grid 2" className="w-full h-24 object-cover" />
                  <img src={PHOTO_PRESETS[2].url} alt="Grid 3" className="w-full h-24 object-cover" />
                  <img src={PHOTO_PRESETS[3].url} alt="Grid 4" className="w-full h-24 object-cover" />
                </div>
              ) : (
                /* Single Media Hero */
                <div className="rounded-xl overflow-hidden border border-neutral-800 my-2">
                  <img
                    src={spec.bgImageUrl || PHOTO_PRESETS[0].url}
                    alt="Media"
                    className="w-full h-40 object-cover"
                  />
                </div>
              )}

              {/* Quoted Tweet Box (Stacked Reply) */}
              <div className="p-3 border border-neutral-800 rounded-xl bg-neutral-900/80 space-y-1.5 my-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-neutral-700 overflow-hidden shrink-0">
                    <img src={PIP_PRESETS[1].url} alt="Quote Author" className="w-full h-full object-cover" />
                  </div>
                  <span className="font-bold text-xs text-white">Pop Base</span>
                  <span className="text-[10px] text-[#1d9bf0]">✓</span>
                  <span className="text-[11px] text-neutral-400">@PopBase</span>
                </div>
                <p className="text-xs text-neutral-200">
                  This remains one of the most unpredictable cultural phenomena of the entire year.
                </p>
              </div>

              {/* Tweet Footer Handle */}
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-neutral-500 text-xs">
                <span>{spec.watermarkText || "@JoeyThemeStudio"}</span>
                <span className="text-[#1d9bf0] font-semibold">Post via Joey</span>
              </div>
            </div>
          ) : (
            /* Standard / Pubity / Morning Brew / Carousel Canvas */
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

              {/* Multi-stop Dark Gradient Contrast Scrim */}
              <div
                style={{
                  background:
                    bgMode === "photo"
                      ? "linear-gradient(180deg, rgba(10,9,8,0.2) 0%, rgba(10,9,8,0.45) 45%, rgba(10,9,8,0.88) 78%, rgba(10,9,8,0.98) 100%)"
                      : undefined,
                }}
                className="absolute inset-0 pointer-events-none"
              />

              {/* Slide 4: Outro Massive Watermark Backdrop */}
              {activeSlide === 4 && (
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

                {spec.topBadge === "circular_seal" && (
                  <div className="w-12 h-12 rounded-full border-2 border-dashed border-[#00e5ff] bg-[#00e5ff]/15 flex flex-col items-center justify-center text-[#00e5ff] font-black text-xs shadow-lg">
                    <span className="text-[7px] font-bold text-white tracking-widest">OFFICIAL</span>
                    <span className="text-sm font-black">{spec.brandInitial || "M"}</span>
                    <span className="text-[7px] font-bold text-white tracking-widest">REPORT</span>
                  </div>
                )}

                {spec.topBadge === "swipe_pill" && (
                  <div className="px-3.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/25 text-white text-[11px] font-bold tracking-wider flex items-center gap-1 shadow-md">
                    SWIPE <IconArrowRight className="w-3.5 h-3.5" style={{ color: spec.accentColor || "#ffe633" }} />
                  </div>
                )}

                {spec.topBadge === "tag_pill" && (
                  <span
                    style={{ backgroundColor: spec.accentColor || "#ffe633" }}
                    className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-[#0a0908] shadow-md"
                  >
                    {previewSample.tag}
                  </span>
                )}

                {spec.topBadge === "none" && <div />}

                {/* Source attribution & Slide number */}
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md text-white/90 text-[11px] font-semibold border border-white/10">
                    {previewSample.source_name}
                  </span>
                  {isCarousel && (
                    <span className="px-2 py-1 rounded-full bg-black/50 backdrop-blur-md text-white/80 text-[11px] font-mono border border-white/10">
                      {activeSlide}/4
                    </span>
                  )}
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
                        <span
                          style={{ color: spec.accentColor || "#ffe633" }}
                          className="text-xs font-black tracking-widest"
                        >
                          {spec.templateFamily === "morning_brew_cyan" ? `— ${spec.brandInitial || "M"} —` : (spec.brandInitial || "🅟")}
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

                {/* Slide 2: Inset / Detail View OR Video Loop for Mixed Carousel */}
                {activeSlide === 2 && (
                  <div className="space-y-4">
                    {spec.templateFamily === "mixed_carousel" && spec.videoUrl ? (
                      /* Live Embedded Video in Slide 2 */
                      <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/20 shadow-2xl relative">
                        <video
                          src={spec.videoUrl}
                          autoPlay
                          loop
                          muted={videoMuted}
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setVideoMuted(!videoMuted)}
                          className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white text-[9px] font-bold flex items-center gap-1"
                        >
                          {videoMuted ? <IconVolumeOff className="w-2.5 h-2.5" /> : <IconVolume className="w-2.5 h-2.5" />}
                          {videoMuted ? "MUTED" : "SOUND ON"}
                        </button>
                      </div>
                    ) : spec.pipInsetUrl ? (
                      <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md p-2 rounded-2xl border border-white/15">
                        <img
                          src={spec.pipInsetUrl}
                          alt="PIP Inset"
                          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-lg shrink-0"
                        />
                        <div className="text-white text-xs">
                          <span
                            style={{ color: spec.accentColor || "#ffe633" }}
                            className="block font-bold"
                          >
                            Spotlight Reaction
                          </span>
                          <span className="text-white/80 text-[11px] leading-tight">Key post-match commentary and field statistics</span>
                        </div>
                      </div>
                    ) : null}

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

                {/* Slide 3: Deep Dive Takeaway */}
                {activeSlide === 3 && (
                  <div className="space-y-3">
                    <span
                      style={{ color: spec.accentColor || "#ffe633" }}
                      className="text-xs font-black uppercase tracking-wider"
                    >
                      KEY TAKEAWAY #3
                    </span>
                    <h3 className="text-xl font-bold text-white leading-snug">
                      Unprecedented performance metrics confirm structural shift across all competitive sectors
                    </h3>
                    <p className="text-xs text-white/80 leading-relaxed">
                      Detailed telemetry data demonstrates 4.2x higher viral retention across both short-form loops and static carousels.
                    </p>
                  </div>
                )}

                {/* Slide 4: Outro CTA View */}
                {activeSlide === 4 && (
                  <div className="text-center py-6 space-y-4">
                    <div
                      style={{
                        backgroundColor: spec.accentColor || "#ffe633",
                        color: "#0a0908",
                      }}
                      className="w-16 h-16 mx-auto rounded-full flex items-center justify-center font-black text-3xl shadow-2xl border-4 border-white"
                    >
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
                    <span style={{ color: spec.accentColor || "#ffe633" }} className="font-bold">
                      {spec.brandInitial || "🅟"}
                    </span>
                    {spec.watermarkText || "@JoeyThemeStudio"}
                  </span>

                  {isCarousel && (
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4].map((slideIdx) => (
                        <span
                          key={slideIdx}
                          style={{
                            backgroundColor: activeSlide === slideIdx ? (spec.accentColor || "#ffe633") : "rgba(255,255,255,0.4)",
                            width: activeSlide === slideIdx ? "16px" : "8px",
                          }}
                          className="h-2 rounded-full transition-all"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
