type Props = {
  name: string;
  formatName?: string | null;
  componentSpec?: unknown;
};

/** A lightweight style preview when a rendered thumbnail is not available. */
export function TemplatePreview({ name, formatName, componentSpec }: Props) {
  const spec = componentSpec && typeof componentSpec === "object" ? componentSpec as Record<string, unknown> : {};
  const background = typeof spec.backgroundGradient === "string" ? spec.backgroundGradient :
    typeof spec.backgroundColor === "string" ? spec.backgroundColor : "#111827";
  const accent = typeof spec.accentColor === "string" ? spec.accentColor : "#facc15";
  const foreground = typeof spec.textColor === "string" ? spec.textColor : "#ffffff";
  const initial = typeof spec.brandInitial === "string" && spec.brandInitial.trim() ? spec.brandInitial.trim().slice(0, 2) : name.slice(0, 1).toUpperCase();
  const watermark = typeof spec.watermarkText === "string" ? spec.watermarkText : "";
  const isCarousel = /carousel/i.test(formatName || "") || spec.templateFamily === "pubity_carousel";

  return <div className="relative flex aspect-square max-h-52 w-full flex-col overflow-hidden rounded-lg p-4 shadow-inner" style={{ background, color: foreground }} aria-label={`${name} style preview`}>
    <div className="flex items-start justify-between gap-2">
      <span className="flex size-9 items-center justify-center rounded-lg text-lg font-black" style={{ backgroundColor: accent, color: "#111827" }}>{initial}</span>
      <span className="rounded-full border border-current/30 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide opacity-80">{isCarousel ? "Swipe →" : "Post"}</span>
    </div>
    <div className="mt-auto min-w-0 space-y-2">
      <div className="h-1 w-12 rounded-full" style={{ backgroundColor: accent }} />
      <p className="line-clamp-3 text-xl font-black leading-tight">Your headline goes here</p>
      <p className="line-clamp-2 text-[10px] opacity-70">A preview of how your story will look in this style.</p>
      <div className="flex items-center justify-between gap-2 border-t border-current/20 pt-2 text-[9px] opacity-70"><span className="truncate">{watermark || name.replace(/\s*\([0-9a-f-]{36}\)$/, "")}</span>{isCarousel && <span className="shrink-0">1 / 4</span>}</div>
    </div>
  </div>;
}
