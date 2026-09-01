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
  IconShieldCheck,
  IconAlertTriangle
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

        const assignedSources = sources.length > 0 
          ? sources.slice(index % sources.length, (index % sources.length) + 2)
          : [];
        const sourceNames = assignedSources.map((s) => s.name);
        const dominantRights = assignedSources[0]?.rightsCategory || "unverified";
        const isCompliant = ["owned", "public_domain", "cc_by", "cc_by_sa", "commercial_license"].includes(dominantRights);

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
            sourcesUsed: sourceNames,
            rightsVerified: dominantRights,
            confidenceScore: assignedSources.length > 0 ? (isCompliant ? 0.95 : 0.45) : 0.0,
            isCompliant,
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
          {(() => {
            const allCompliant = simulatedPackages.every((p) => p.provenance.isCompliant);
            return (
              <div
                className={`flex items-center justify-between p-4 rounded-xl text-xs border ${
                  allCompliant
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  {allCompliant ? (
                    <IconCheck className="w-4 h-4 shrink-0 font-bold" />
                  ) : (
                    <IconAlertTriangle className="w-4 h-4 shrink-0 font-bold" />
                  )}
                  <span>
                    Simulated <strong>{simulatedPackages.length} packages</strong> across {sources.length} active feeds.{" "}
                    {allCompliant ? "All rights verified." : "Some packages require license/rights review."}
                  </span>
                </div>
                <button
                  onClick={handleSimulate}
                  className="underline hover:no-underline font-semibold"
                >
                  Re-run
                </button>
              </div>
            );
          })()}

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
                    {pkg.provenance.isCompliant ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <IconShieldCheck className="w-3.5 h-3.5" /> Rights Verified ({pkg.provenance.rightsVerified.toUpperCase()})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <IconAlertTriangle className="w-3.5 h-3.5" /> Rights Review Needed ({pkg.provenance.rightsVerified.toUpperCase()})
                      </span>
                    )}
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
                  <span>Sources: {pkg.provenance.sourcesUsed.length > 0 ? pkg.provenance.sourcesUsed.join(", ") : "None assigned"}</span>
                  <span className={`font-semibold ${pkg.provenance.isCompliant ? "text-primary" : "text-amber-600 dark:text-amber-400"}`}>
                    {pkg.provenance.isCompliant ? "Ready for Approval" : "Needs Rights Review"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
