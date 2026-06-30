import { useEffect, useState } from "react";

/**
 * Returns a counter that increments at least once per minute, aligned to the
 * next wall-clock minute boundary. Used to invalidate venue open/closed
 * caches (`useMemo([venues, tick])`) so pills flip exactly when they should.
 *
 * Staleness defenses:
 *  - Aligns the first tick to the next minute boundary (no up-to-59s drift).
 *  - Refreshes on `visibilitychange` → visible (browsers throttle/pause
 *    setInterval in hidden tabs; the cache could otherwise be minutes stale).
 *  - Refreshes on window `focus` (covers system sleep/wake and clock jumps).
 *  - Cleans up every timer + listener on unmount.
 */
export function useOpenNowTick(intervalMs = 60_000): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let alignId: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const bump = () => {
      if (!mounted) return;
      setTick((n) => (n + 1) % 1_000_000);
    };

    // Align first tick to the next wall-clock minute, then run every `intervalMs`.
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    alignId = setTimeout(() => {
      bump();
      intervalId = setInterval(bump, intervalMs);
    }, Math.max(0, msToNextMinute));

    // Heal staleness when the tab returns to the foreground or window regains
    // focus (covers throttled intervals, system sleep, and clock changes).
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        bump();
      }
    };
    const onFocus = () => bump();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }

    return () => {
      mounted = false;
      if (alignId !== null) clearTimeout(alignId);
      if (intervalId !== null) clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, [intervalMs]);

  return tick;
}