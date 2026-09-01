"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { 
  IconSparkles, 
  IconCheck, 
  IconArrowRight, 
  IconArrowLeft, 
  IconPlus, 
  IconTrash, 
  IconRss, 
  IconCards, 
  IconPalette, 
  IconLoader2 
} from "@tabler/icons-react";
import { createThemePage } from "@/app/actions/theme-pages";
import { createThemeSource } from "@/app/actions/theme-sources";
import { createThemeSlot } from "@/app/actions/theme-slots";
import { createThemeTemplate } from "@/app/actions/theme-templates";
import { toast } from "sonner";

interface FormatItem {
  id: string;
  slug: string;
  name: string;
  mediaType: string;
  aspectRatio?: string | null;
}

interface ThemePageWizardProps {
  availableFormats: FormatItem[];
}

export function ThemePageWizard({ availableFormats }: ThemePageWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(false);

  // Step 1: Niche & Voice
  const [name, setName] = React.useState("");
  const [niche, setNiche] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [voice, setVoice] = React.useState("Authoritative, concise, insightful with engaging hooks");

  // Step 2: Initial Sources
  const [sources, setSources] = React.useState<Array<{ name: string; url: string; type: "rss" | "reddit" | "http" }>>([
    { name: "Primary News Feed", url: "", type: "rss" },
  ]);

  // Step 3: Mix Preset
  const [selectedPreset, setSelectedPreset] = React.useState<"growth" | "authority" | "news">("growth");

  // Step 4: Brand Kit
  const [primaryColor, setPrimaryColor] = React.useState("#0f172a");
  const [accentColor, setAccentColor] = React.useState("#38bdf8");
  const [watermark, setWatermark] = React.useState("@YourHandle");

  function addSourceField() {
    setSources((prev) => [...prev, { name: `Source #${prev.length + 1}`, url: "", type: "rss" }]);
  }

  function removeSourceField(idx: number) {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSourceField(idx: number, field: string, val: string) {
    setSources((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s))
    );
  }

  async function handleFinish() {
    if (!name.trim()) {
      toast.error("Please provide a name for your theme page");
      setStep(1);
      return;
    }

    setLoading(true);
    try {
      // 1. Create Theme Page
      const pageRes = await createThemePage({
        name: name.trim(),
        niche: niche.trim() || undefined,
        audience: audience.trim() || undefined,
        voice: voice.trim() || undefined,
        brandKit: {
          primaryColor,
          accentColor,
          watermark,
        },
      });

      if (pageRes.error || !pageRes.page) {
        throw new Error(pageRes.error || "Failed to create theme page");
      }

      const pageId = pageRes.page.id;

      // 2. Add Sources
      for (const src of sources) {
        if (src.url.trim()) {
          await createThemeSource({
            themePageId: pageId,
            name: src.name.trim() || "Source Feed",
            sourceType: src.type,
            url: src.url.trim(),
            rightsCategory: "cc_by",
          });
        }
      }

      // 3. Add Slots based on preset
      const squareCard = availableFormats.find((f) => f.slug === "instagram-card-1080") || availableFormats[0];
      const carousel = availableFormats.find((f) => f.slug === "instagram-carousel-1080") || availableFormats[0];
      const video = availableFormats.find((f) => f.slug === "instagram-reel-9x16") || availableFormats[0];

      if (selectedPreset === "growth") {
        if (squareCard) await createThemeSlot({ themePageId: pageId, formatId: squareCard.id, label: "Daily News Card", priority: 0 });
        if (carousel) await createThemeSlot({ themePageId: pageId, formatId: carousel.id, label: "5-Slide Deep Dive Carousel", priority: 1 });
        if (video) await createThemeSlot({ themePageId: pageId, formatId: video.id, label: "9:16 Short Breakdown Video", priority: 2 });
      } else if (selectedPreset === "authority") {
        if (carousel) await createThemeSlot({ themePageId: pageId, formatId: carousel.id, label: "Morning Carousel Playbook", priority: 0 });
        if (carousel) await createThemeSlot({ themePageId: pageId, formatId: carousel.id, label: "Evening Strategy Breakdown", priority: 1 });
      } else {
        if (squareCard) await createThemeSlot({ themePageId: pageId, formatId: squareCard.id, label: "Morning Flash News", priority: 0 });
        if (squareCard) await createThemeSlot({ themePageId: squareCard.id, formatId: squareCard.id, label: "Evening Recap Card", priority: 1 });
      }

      // 4. Create Default Visual Template
      if (squareCard) {
        await createThemeTemplate({
          themePageId: pageId,
          name: `${name} Official Card Template`,
          formatId: squareCard.id,
          renderer: "puppeteer",
          componentSpec: {
            backgroundColor: primaryColor,
            accentColor: accentColor,
            textColor: "#f8fafc",
            watermarkText: watermark,
            titleTemplate: "{{title}}",
            bodyTemplate: "{{summary}}",
          },
        });
      }

      toast.success("Theme page created successfully!");
      router.push(`/theme-studio/${pageId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create theme page");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8 border rounded-3xl bg-card shadow-xl space-y-8">
      {/* Step Indicators */}
      <div className="flex items-center justify-between border-b pb-6">
        {[
          { num: 1, label: "Niche & Voice" },
          { num: 2, label: "Sources" },
          { num: 3, label: "Content Mix" },
          { num: 4, label: "Brand Kit" },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s.num
                  ? "bg-primary text-primary-foreground"
                  : step > s.num
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s.num ? <IconCheck className="w-4 h-4" /> : s.num}
            </span>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                step === s.num ? "text-foreground font-semibold" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Niche & Voice */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Define Your Theme Page Niche</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Give your page an identity, target audience, and editorial voice.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Page Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NBA Daily Pulse"
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Specific Niche</label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. Basketball highlights, stats, and trade news"
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Target Audience</label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Die-hard basketball fans looking for daily insights"
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tone & Voice Guide</label>
              <textarea
                rows={2}
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Sources */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Connect Initial Sources</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Where should Joey discover news and stories? (You can add more later)
              </p>
            </div>
            <button
              type="button"
              onClick={addSourceField}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80"
            >
              <IconPlus className="w-3.5 h-3.5" /> Add Feed
            </button>
          </div>

          <div className="space-y-3">
            {sources.map((src, idx) => (
              <div key={idx} className="p-3 border rounded-xl bg-card space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={src.name}
                    onChange={(e) => updateSourceField(idx, "name", e.target.value)}
                    placeholder="Source Label"
                    className="text-xs font-semibold bg-transparent border-none focus:outline-none w-1/2"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={src.type}
                      onChange={(e) => updateSourceField(idx, "type", e.target.value)}
                      className="px-2 py-1 text-xs border rounded bg-background"
                    >
                      <option value="rss">RSS Feed</option>
                      <option value="reddit">Reddit</option>
                      <option value="http">HTTP Web</option>
                    </select>
                    {sources.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSourceField(idx)}
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={src.url}
                  onChange={(e) => updateSourceField(idx, "url", e.target.value)}
                  placeholder={src.type === "reddit" ? "r/nba" : "https://example.com/rss.xml"}
                  className="w-full px-3 py-1.5 text-xs border rounded-lg bg-background font-mono"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Content Mix Presets */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Select a Daily Content Recipe</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Choose a proven daily publishing mix for your niche.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                id: "growth",
                title: "Growth Mix ⭐",
                desc: "1 News Card + 1 Carousel + 1 Short Video",
                sub: "Best for rapid follower growth and algorithm discovery",
              },
              {
                id: "authority",
                title: "Authority Mix",
                desc: "2 Carousels Daily",
                sub: "Best for high saves, shares, and educational authority",
              },
              {
                id: "news",
                title: "News Digest",
                desc: "2 Breaking News Cards",
                sub: "Best for fast turnaround sports & tech curation",
              },
            ].map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedPreset(p.id as any)}
                className={`p-4 border-2 rounded-2xl cursor-pointer transition-all ${
                  selectedPreset === p.id
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border hover:border-muted-foreground/40 bg-card"
                }`}
              >
                <h3 className="font-bold text-sm">{p.title}</h3>
                <p className="text-xs font-semibold text-primary mt-1">{p.desc}</p>
                <p className="text-[11px] text-muted-foreground mt-2">{p.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Brand Kit */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Set Up Your Brand Style</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Deterministic styling applied to all generated cards, carousels, and videos.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5">Primary Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5">Watermark / Handle</label>
              <input
                type="text"
                value={watermark}
                onChange={(e) => setWatermark(e.target.value)}
                placeholder="@NBADailyPulse"
                className="w-full px-3.5 py-2 text-sm border rounded-xl font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-6 border-t">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border rounded-xl hover:bg-muted"
          >
            <IconArrowLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 1 && !name.trim()) {
                toast.error("Please enter a page name");
                return;
              }
              setStep((s) => s + 1);
            }}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90"
          >
            Continue <IconArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 shadow-lg disabled:opacity-50"
          >
            {loading ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconSparkles className="w-4 h-4" />}
            Create Theme Page
          </button>
        )}
      </div>
    </div>
  );
}
