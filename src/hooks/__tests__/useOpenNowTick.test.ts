import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOpenNowTick } from "../useOpenNowTick";

describe("useOpenNowTick — staleness defenses", () => {
  beforeEach(() => {
    // Pin wall-clock to 12:00:30.000 so the first aligned tick should land at
    // 12:01:00.000 — i.e. 30s after mount.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 6, 12, 0, 30, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aligns the first tick to the next wall-clock minute (no 59s drift)", () => {
    const { result } = renderHook(() => useOpenNowTick());
    expect(result.current).toBe(0);

    // 29s in — still before the boundary → no tick.
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current).toBe(0);

    // Cross the boundary (30s → exactly the next minute) → tick fires once.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(1);
  });

  it("keeps ticking every 60s after the aligned first tick", () => {
    const { result } = renderHook(() => useOpenNowTick());
    act(() => {
      vi.advanceTimersByTime(30_000); // first aligned tick
    });
    expect(result.current).toBe(1);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(2);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(3);
  });

  it("refreshes immediately on visibilitychange → visible (backgrounded tab heal)", () => {
    const { result } = renderHook(() => useOpenNowTick());
    expect(result.current).toBe(0);

    // Simulate the tab being hidden then returning to the foreground.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(1);
  });

  it("ignores visibilitychange when the tab is hidden (avoid wasted recomputes)", () => {
    const { result } = renderHook(() => useOpenNowTick());
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(0);
  });

  it("refreshes on window focus (covers system sleep/wake + clock jumps)", () => {
    const { result } = renderHook(() => useOpenNowTick());
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(result.current).toBe(1);
  });

  it("cleans up timers and listeners on unmount (no leaks, no late ticks)", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const docRemove = vi.spyOn(document, "removeEventListener");
    const winRemove = vi.spyOn(window, "removeEventListener");

    const { result, unmount } = renderHook(() => useOpenNowTick());
    // Let the aligned first tick start the recurring interval.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(1);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(docRemove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(winRemove).toHaveBeenCalledWith("focus", expect.any(Function));

    // No further ticks after unmount, even if listeners somehow fired.
    const last = result.current;
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(last);
  });
});