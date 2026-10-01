import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  teal: "bg-chart-2/10 text-chart-2",
  violet: "bg-chart-4/10 text-chart-4",
  amber: "bg-chart-5/10 text-chart-5",
  blue: "bg-chart-3/10 text-chart-3",
};

/** Original geometric marks, not third-party mascot artwork. */
export function AgentIdentity({ shape, color, className }: { shape: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-2xl",
        tones[color] ?? tones.teal,
        className
      )}
    >
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-7">
        {shape === "prism" ? (
          <>
            <path d="m16 4 12 21H4L16 4Z" />
            <path d="m16 4 0 21M4 25l12-8 12 8" />
          </>
        ) : shape === "ripple" ? (
          <>
            <path d="M4 12c4-8 20-8 24 0M6 18c3-7 17-7 20 0M10 24c2-5 10-5 12 0" />
            <circle cx="16" cy="27" r="1" />
          </>
        ) : (
          <>
            <circle cx="16" cy="16" r="5" />
            <ellipse cx="16" cy="16" rx="13" ry="8" transform="rotate(-35 16 16)" />
            <circle cx="25" cy="9" r="2" fill="currentColor" />
          </>
        )}
      </svg>
    </span>
  );
}
