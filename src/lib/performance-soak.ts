export function maximumEventsInWindow(timestamps: number[], windowMs: number): number {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error("windowMs must be positive.");
  const ordered = [...timestamps].sort((left, right) => left - right);
  let start = 0;
  let maximum = 0;
  for (let end = 0; end < ordered.length; end += 1) {
    while (ordered[end] - ordered[start] >= windowMs) start += 1;
    maximum = Math.max(maximum, end - start + 1);
  }
  return maximum;
}
