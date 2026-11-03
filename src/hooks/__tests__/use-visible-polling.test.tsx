import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisiblePolling } from "../use-visible-polling";

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const visibility = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};
beforeEach(() => { vi.useFakeTimers(); visibility(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); Reflect.deleteProperty(document, "hidden"); });

describe("visible polling", () => {
  it("does no background work while hidden and refreshes on return", async () => {
    const poll = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(poll, 5_000));
    await advance(0);
    expect(poll).toHaveBeenCalledTimes(1);
    act(() => visibility(true));
    await advance(60_000);
    expect(poll).toHaveBeenCalledTimes(1);
    act(() => visibility(false));
    await advance(0);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("never overlaps a slow request, including across a cadence change", async () => {
    let complete!: () => void;
    const poll = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; })).mockResolvedValue(undefined);
    const hook = renderHook(({ interval }) => useVisiblePolling(poll, interval), { initialProps: { interval: 5_000 } });
    hook.rerender({ interval: 30_000 });
    await advance(60_000);
    expect(poll).toHaveBeenCalledTimes(1);
    await act(async () => complete());
    await advance(30_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("backs off failures and restores the normal cadence after recovery", async () => {
    const poll = vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(poll, 5_000));
    await advance(0);
    await advance(5_000);
    expect(poll).toHaveBeenCalledTimes(1);
    await advance(5_000);
    expect(poll).toHaveBeenCalledTimes(2);
    await advance(20_000);
    expect(poll).toHaveBeenCalledTimes(3);
    await advance(5_000);
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it("does not fetch on mount when the server already supplied the initial value", async () => {
    const poll = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(poll, 120_000, { immediate: false }));
    await advance(119_999);
    expect(poll).not.toHaveBeenCalled();
    await advance(1);
    expect(poll).toHaveBeenCalledOnce();
  });

  it("stops recurring work when runs finish but still refreshes on tab return", async () => {
    const poll = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(poll, null));
    await advance(300_000);
    expect(poll).toHaveBeenCalledOnce();
    act(() => visibility(true));
    act(() => visibility(false));
    await advance(0);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("disables timers and invalidates late results when a panel closes", async () => {
    let signal!: AbortSignal;
    const poll = vi.fn(async (value: AbortSignal) => { signal = value; });
    const hook = renderHook(({ enabled }) => useVisiblePolling(poll, 5_000, { enabled }), { initialProps: { enabled: false } });
    await advance(20_000);
    expect(poll).not.toHaveBeenCalled();
    hook.rerender({ enabled: true });
    await advance(0);
    hook.rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
    await advance(20_000);
    expect(poll).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not rearm a timer when an unmounted request eventually completes", async () => {
    let complete!: () => void;
    const poll = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
    const hook = renderHook(() => useVisiblePolling(poll, 5_000));
    hook.unmount();
    await act(async () => complete());
    await advance(60_000);
    expect(poll).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
