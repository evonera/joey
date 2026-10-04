/** Browser metadata is advisory; the worker independently probes the source. */
export function maximumTrimDuration(start: number, sourceDuration: number | null): number {
  if (!Number.isFinite(start) || start < 0 || start > 86400) return 0;
  if (sourceDuration === null) return 60;
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return 0;
  return Math.max(0, Math.min(60, sourceDuration - start));
}

export function trimError(start: number, duration: number, sourceDuration: number | null): string | null {
  if (!Number.isFinite(start) || start < 0 || start > 86400) return "Choose a valid nonnegative start time.";
  if (!Number.isFinite(duration) || duration < 1 || duration > 60) return "Export duration must be between 1 and 60 seconds.";
  if (duration - maximumTrimDuration(start, sourceDuration) > 1e-9) return "The selected range exceeds the remaining source. Choose at least one second of usable video.";
  return null;
}
