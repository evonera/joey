"use client";

import { useEffect, useRef } from "react";

/** One request at a time, suspended in hidden tabs, with bounded failure backoff. */
export function useVisiblePolling(
  poll: (signal: AbortSignal) => Promise<void>,
  intervalMs: number | null,
  { enabled = true, immediate = true } = {},
) {
  const busy = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    return startPolling(poll, intervalMs, immediate, busy);
  }, [poll, intervalMs, enabled, immediate]);
}

function startPolling(
  poll: (signal: AbortSignal) => Promise<void>,
  intervalMs: number | null,
  immediate: boolean,
  busy: { current: boolean },
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let failures = 0;

  const schedule = () => {
    if (!controller.signal.aborted && !document.hidden) {
      if (intervalMs === null && failures === 0) return;
      const baseDelay = intervalMs ?? 30_000;
      const delay = Math.min(baseDelay * 2 ** failures, Math.max(baseDelay, 120_000));
      timer = setTimeout(() => { void tick(); }, delay);
    }
  };
  const tick = async () => {
    clearTimeout(timer);
    if (controller.signal.aborted || document.hidden || running) return;
    if (busy.current) {
      timer = setTimeout(() => { void tick(); }, intervalMs ?? 30_000);
      return;
    }
    running = true;
    busy.current = true;
    try {
      await poll(controller.signal);
      failures = 0;
    } catch {
      // Callers display the error; don't hammer a failing service.
      failures = Math.min(failures + 1, 6);
    } finally {
      running = false;
      busy.current = false;
      schedule();
    }
  };
  const onVisibility = () => {
    clearTimeout(timer);
    if (!document.hidden) void tick();
  };
  document.addEventListener("visibilitychange", onVisibility);
  if (immediate) void tick();
  else schedule();
  return () => {
    controller.abort();
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
