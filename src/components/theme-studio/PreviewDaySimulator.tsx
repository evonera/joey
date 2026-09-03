"use client";

import * as React from "react";
import { 
  IconSparkles, 
  IconEye, 
  IconCards, 
  IconVideo, 
  IconPhoto, 
  IconCheck, 
  IconShieldCheck,
  IconChevronLeft,
  IconChevronRight,
  IconFileText,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { RemotionPreviewPlayer } from "./video/RemotionPreviewPlayer";
import { buildVerticalNewsComposition, RemotionCompositionProps } from "@/lib/theme-studio/renderers/video-renderer";

interface SlotItem {
  id: string;
  label?: string | null;
  format?: {
    slug: string;
    name: string;
    platform: string;
    mediaType: string;
    aspectRatio?: string | null;
  } | null;
}

interface SourceItem {
  id: string;
  name: string;
  sourceType: string;
  rightsCategory: string;
}

interface PreviewDaySimulatorProps {
  themePage: {
    id: string;
    name: string;
    niche?: string | null;
    voice?: string | null;
    brandKit?: unknown;
  };
  slots: SlotItem[];
  sources: SourceItem[];
}

interface SimulatedPackage {
  id: string;
  slotLabel: string;
  format?: SlotItem["format"];
  title: string;
  caption: string;
  provenance: {
    sourcesUsed: string[];
    rightsCategories: string[];
    isVerified: boolean;
  };
  slides?: Array<{ num: number; title: string; text: string; tag: string }>;
  composition?: RemotionCompositionProps;
}

export function PreviewDaySimulator({ themePage, slots, sources }: PreviewDaySimulatorProps) {
  const [simulating, setSimulating] = React.useState(false);
  const [hasRun, setHasRun] = React.useState(false);
  const [simulatedPackages, setSimulatedPackages] = React.useState<SimulatedPackage[]>([]);

  function handleSimulate() {
    setSimulating(true);
    setTimeout(() => {
      const pageBrandKit = (themePage.brandKit as Record<string, string>) || {};
      const primaryColor = pageBrandKit.primaryColor || "#0f172a";
      const accentColor = pageBrandKit.accentColor || "#38bdf8";
      const watermark = pageBrandKit.watermark || `@${(themePage.name || "ThemePage").replace(/\s+/g, "")}`;

      const mockPackages: SimulatedPackage[] = slots.map((slot, index) => {
        const isVideo = slot.format?.mediaType === "video";
        const isCarousel = slot.format?.mediaType === "carousel";

        const title = isVideo
          ? "Top 3 High-Impact Tactics Shaking Up the Industry This Week"
          : isCarousel
          ? "The Complete 5-Slide Playbook: From Zero to 100K Followers"
          : "Breaking Analysis: Strategic Moves Behind Recent Market Shifts";

        const videoComposition = isVideo
          ? buildVerticalNewsComposition({
              title,
              points: [
                "New generative workflows cutting production cycles by 80%",
                "Direct algorithmic shifts favoring original investigative curation",
                "How community DM triggers are outperforming broadcast links",
              ],
              ctaKeyword: "GUIDE",
              brandKit: { primaryColor, accentColor, watermark },
            })
          : undefined;

        const slides = isCarousel
          ? [
              { num: 1, tag: "COVER", title: "The 2026 Shift", text: "Why traditional distribution broke and what took its place" },
              { num: 2, tag: "TACTIC 1", title: "Algorithm Signals", text: "Private shares and mutual replies now outweigh public likes 10:1" },
              { num: 3, tag: "TACTIC 2", title: "Theme Page Flywheel", text: "Single-niche feeds aggregate targeted buyer attention without personal brand exhaustion" },
              { num: 4, tag: "TACTIC 3", title: "Automated DM Funnels", text: "Comment keywords automatically deliver resources into private inboxes" },
              { num: 5, tag: "ACTION", title: "Action Checklist", text: "Comment 'GUIDE' to get our step-by-step SOP delivered to your DMs" },
            ]
          : undefined;

        return {
          id: `sim_pkg_${index + 1}`,
          slotLabel: slot.label || slot.format?.name || `Slot #${index + 1}`,
          format: slot.format,
          title,
          caption: `🔥 Essential update for ${themePage.niche || "enthusiasts"}.\n\nSwipe through for the breakdown. What's your take on this?\n\nComment 'GUIDE' to receive the full report in your DMs!\n\n#${(themePage.niche || "daily").replace(/\s+/g, "")} #updates #insights`,
          provenance: {
            sourcesUsed: sources.slice(0, 2).map((s) => s.name),
            rightsCategories: [...new Set(sources.slice(0, 2).map((s) => s.rightsCategory))],
            isVerified: sources.length > 0 && sources.slice(0, 2).every((s) =>
              ["owned", "generated", "public_domain", "cc_by", "cc_by_sa", "commercial_license"].includes(s.rightsCategory)
            ),
          },
          slides,
          composition: videoComposition,
        };
      });

      setSimulatedPackages(mockPackages);
      setSimulating(false);
      setHasRun(true);
      toast.success("Mock day preview generated");
    }, 1000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">"Preview Day" Simulation</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Simulate a full 24-hour cycle of posts, reels, and carousels for <strong>{themePage.name}</strong> before publishing.
          </p>
        </div>
        <button
          onClick={handleSimulate}
          disabled={simulating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
        >
          {simulating ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              <span>Synthesizing angles...</span>
            </>
          ) : (
            <>
              <IconSparkles className="w-4 h-4" />
              <span>{hasRun ? "Re-simulate Day" : "Run Simulation"}</span>
            </>
          )}
        </button>
      </div>

      {!hasRun ? (
        <div className="p-16 text-center border border-dashed rounded-2xl bg-card/40">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <IconSparkles className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold">Simulate a Full Day's Production</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1.5 mb-6">
            Joey will take your {sources.length} sources and compose packages for all {slots.length} daily mix slots with brand formatting, vertical video reels, and proof-of-provenance.
          </p>
          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <IconSparkles className="w-4 h-4" /> Start Simulation
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 p-4 rounded-xl text-xs">
            <div className="flex items-center gap-2">
              <IconCheck className="w-4 h-4 shrink-0 font-bold" />
              <span>
                Simulated <strong>{simulatedPackages.length} packages</strong> across {sources.length} active feeds. Interactive video player and carousel viewer are active.
              </span>
            </div>
            <button
              onClick={handleSimulate}
              className="underline hover:no-underline font-semibold"
            >
              Re-run
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {simulatedPackages.map((pkg, idx) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                idx={idx}
                brandKit={(themePage.brandKit as any) || {}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PackageCard({
  pkg,
  idx,
  brandKit,
}: {
  pkg: SimulatedPackage;
  idx: number;
  brandKit: Record<string, string>;
}) {
  const isVideo = pkg.format?.mediaType === "video";
  const isCarousel = pkg.format?.mediaType === "carousel";
  const [activeTab, setActiveTab] = React.useState<"preview" | "script">("preview");
  const [activeSlide, setActiveSlide] = React.useState(0);

  const primaryColor = brandKit.primaryColor || "#0f172a";
  const accentColor = brandKit.accentColor || "#38bdf8";
  const watermark = brandKit.watermark || "@ThemeStudio";

  return (
    <div className="p-5 border rounded-2xl bg-card space-y-4 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary flex items-center gap-1.5">
            {isVideo ? <IconVideo className="w-3.5 h-3.5" /> : isCarousel ? <IconCards className="w-3.5 h-3.5" /> : <IconPhoto className="w-3.5 h-3.5" />}
            Slot #{idx + 1} · {pkg.slotLabel}
          </span>
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${pkg.provenance.isVerified ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            <IconShieldCheck className="w-3.5 h-3.5" /> {pkg.provenance.isVerified ? "Rights verified" : "Review required"}
          </span>
        </div>

        <h3 className="font-bold text-base leading-snug">{pkg.title}</h3>

        <div className="flex items-center gap-1 mt-3 mb-4 bg-muted/40 p-1 rounded-xl w-fit text-xs font-medium">
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "preview" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"}`}
          >
            <IconEye className="w-3.5 h-3.5" /> Media Preview
          </button>
          <button
            onClick={() => setActiveTab("script")}
            className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "script" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"}`}
          >
            <IconFileText className="w-3.5 h-3.5" /> Script & Copy
          </button>
        </div>

        {activeTab === "preview" && (
          <div className="my-2">
            {isVideo && pkg.composition ? (
              <div className="py-2 bg-zinc-950/5 dark:bg-zinc-950/40 rounded-2xl border p-4 flex flex-col items-center">
                <RemotionPreviewPlayer composition={pkg.composition} />
              </div>
            ) : isCarousel && pkg.slides ? (
              <div className="space-y-3">
                <div
                  style={{
                    backgroundColor: primaryColor,
                    borderColor: accentColor,
                  }}
                  className="rounded-2xl border p-6 min-h-[220px] flex flex-col justify-between text-white shadow-md relative overflow-hidden"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      style={{ backgroundColor: `${accentColor}30`, color: accentColor }}
                      className="px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider"
                    >
                      {pkg.slides[activeSlide]?.tag}
                    </span>
                    <span className="font-mono text-white/60 text-[11px]">
                      {activeSlide + 1} / {pkg.slides.length}
                    </span>
                  </div>

                  <div className="py-4 space-y-2">
                    <h4 className="text-lg font-extrabold leading-tight">
                      {pkg.slides[activeSlide]?.title}
                    </h4>
                    <p className="text-xs text-white/80 leading-relaxed">
                      {pkg.slides[activeSlide]?.text}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-white/50 border-t border-white/10 pt-2">
                    <span>{watermark}</span>
                    <span>Swipe for more →</span>
                  </div>
                </div>

                <div className="flex items-center justify-between px-1">
                  <button
                    onClick={() => setActiveSlide((prev) => Math.max(0, prev - 1))}
                    disabled={activeSlide === 0}
                    className="p-1.5 rounded-lg border text-xs font-medium hover:bg-muted disabled:opacity-40"
                  >
                    <IconChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex gap-1.5">
                    {pkg.slides.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveSlide(i)}
                        style={{ backgroundColor: i === activeSlide ? accentColor : undefined }}
                        className={`w-2 h-2 rounded-full transition-all ${i === activeSlide ? "w-5" : "bg-muted-foreground/30"}`}
                      />
                    ))}
                  </div>

                  <button
                    onClick={() => setActiveSlide((prev) => Math.min(pkg.slides!.length - 1, prev + 1))}
                    disabled={activeSlide === pkg.slides.length - 1}
                    className="p-1.5 rounded-lg border text-xs font-medium hover:bg-muted disabled:opacity-40"
                  >
                    <IconChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: primaryColor,
                  borderColor: accentColor,
                }}
                className="rounded-2xl border p-6 min-h-[220px] flex flex-col justify-between text-white shadow-md"
              >
                <div className="flex items-center justify-between text-xs">
                  <span
                    style={{ backgroundColor: `${accentColor}30`, color: accentColor }}
                    className="px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider"
                  >
                    BREAKING UPDATE
                  </span>
                  <span className="font-mono text-white/60 text-[11px]">1:1 Branded Card</span>
                </div>

                <div className="py-4 space-y-2">
                  <h4 className="text-base font-extrabold leading-tight">{pkg.title}</h4>
                  <p className="text-xs text-white/80 line-clamp-3 leading-relaxed">
                    {pkg.caption.slice(0, 180)}...
                  </p>
                </div>

                <div className="flex items-center justify-between text-[11px] text-white/50 border-t border-white/10 pt-2">
                  <span>{watermark}</span>
                  <span>{pkg.provenance.sourcesUsed[0] || "Verified feed"}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "script" && (
          <div className="space-y-3 my-2">
            <div className="p-3.5 bg-muted/20 border rounded-xl text-xs font-mono text-muted-foreground whitespace-pre-line leading-relaxed">
              {pkg.caption}
            </div>

            {pkg.slides && (
              <div className="p-3 bg-muted/30 rounded-xl space-y-1.5 text-xs font-mono">
                <div className="font-bold text-foreground text-[11px] uppercase tracking-wider mb-1">
                  Carousel Slide Outline:
                </div>
                {pkg.slides.map((s) => (
                  <div key={s.num} className="text-muted-foreground">
                    • <strong className="text-foreground">{s.tag}:</strong> {s.title} — {s.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
        <span>Sources: {pkg.provenance.sourcesUsed.join(", ") || "Feed sync"}</span>
        <span className="font-semibold text-primary">Interactive Preview</span>
      </div>
    </div>
  );
}
