"use client";

import * as React from "react";
import { 
  IconSparkles, 
  IconEye, 
  IconCards, 
  IconVideo, 
  IconPhoto, 
  IconRefresh, 
  IconCheck, 
  IconClock, 
  IconLoader2,
  IconShieldCheck
} from "@tabler/icons-react";
import { toast } from "sonner";

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
  };
  slots: SlotItem[];
  sources: SourceItem[];
}

export function PreviewDaySimulator({ themePage, slots, sources }: PreviewDaySimulatorProps) {
  const [simulating, setSimulating] = React.useState(false);
  const [hasRun, setHasRun] = React.useState(false);

  // Simulated output packages
  const [simulatedPackages, setSimulatedPackages] = React.useState<any[]>([]);

  function handleSimulate() {
    setSimulating(true);
    setTimeout(() => {
      const mockPackages = slots.map((slot, index) => {
        const isVideo = slot.format?.mediaType === "video";
        const isCarousel = slot.format?.mediaType === "carousel";

        return {
          id: `sim_pkg_${index + 1}`,
          slotLabel: slot.label || slot.format?.name || `Slot #${index + 1}`,
          format: slot.format,
          title: isVideo
            ? "Top 3 High-Impact Tactics Shaking Up the Industry This Week"
            : isCarousel
            ? "The Complete 5-Slide Playbook: From Zero to 100K Followers"
            : "Breaking Analysis: Strategic Moves Behind Recent Market Shifts",
          caption: `🔥 Essential update for ${themePage.niche || "enthusiasts"}.\n\nSwipe through for the breakdown. What's your take on this?\n\nComment 'GUIDE' to receive the full report in your DMs!\n\n#${(themePage.niche || "daily").replace(/\s+/g, "")} #updates #insights`,
          provenance: {
            sourcesUsed: sources.slice(0, 2).map((s) => s.name),
            rightsVerified: "cc_by",
            confidenceScore: 0.98,
          },
          slides: isCarousel
            ? [
                { num: 1, text: "Slide 1: Executive Summary & Context" },
                { num: 2, text: "Slide 2: Key Tactical Breakthroughs" },
                { num: 3, text: "Slide 3: Real-World Case Studies" },
                { num: 4, text: "Slide 4: Common Pitfalls to Avoid" },
                { num: 5, text: "Slide 5: Actionable Checklist & CTA" },
              ]
            : undefined,
        };
      });

      setSimulatedPackages(mockPackages);
      setSimulating(false);
      setHasRun(true);
      toast.success("Simulation complete! 24-hour mix generated.");
    }, 1200);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">"Preview Day" Simulation</h2>
          <p className="text-sm text-muted-foreground">
            Test your recipe against mock and live data to preview what tomorrow's batch will look like.
          </p>
        </div>
        <button
          onClick={handleSimulate}
          disabled={simulating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 self-start"
        >
          {simulating ? (
            <>
              <IconLoader2 className="w-4 h-4 animate-spin" /> Simulating Day...
            </>
          ) : (
            <>
              <IconSparkles className="w-4 h-4" /> Run Day Simulation
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
            Joey will take your {sources.length} sources and compose packages for all {slots.length} daily mix slots with brand formatting and proof-of-provenance.
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
                Simulated <strong>{simulatedPackages.length} packages</strong> across {sources.length} active feeds. All rights verified.
              </span>
            </div>
            <button
              onClick={handleSimulate}
              className="underline hover:no-underline font-semibold"
            >
              Re-run
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {simulatedPackages.map((pkg, idx) => (
              <div
                key={pkg.id}
                className="p-5 border rounded-2xl bg-card space-y-4 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                      Slot #{idx + 1} · {pkg.slotLabel}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <IconShieldCheck className="w-3.5 h-3.5" /> Rights Verified
                    </span>
                  </div>

                  <h3 className="font-bold text-base leading-snug">{pkg.title}</h3>

                  {pkg.slides ? (
                    <div className="my-3 p-3 bg-muted/40 rounded-xl space-y-1.5 text-xs font-mono">
                      {pkg.slides.map((s: any) => (
                        <div key={s.num} className="text-muted-foreground">
                          • {s.text}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 p-3 bg-muted/20 border rounded-xl text-xs font-mono text-muted-foreground whitespace-pre-line leading-relaxed">
                    {pkg.caption}
                  </div>
                </div>

                <div className="pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                  <span>Sources: {pkg.provenance.sourcesUsed.join(", ")}</span>
                  <span className="font-semibold text-primary">Ready for Approval</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
