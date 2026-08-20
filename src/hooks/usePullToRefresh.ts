import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  /** Scroll container to watch. Pull only arms when it is scrolled to the top. */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Async refresh handler. Indicator stays until it settles. */
  onRefresh?: () => void | Promise<unknown>;
  /** Distance in px the user must drag before a refresh fires. */
  threshold?: number;
}

/**
 * Standard mobile pull-to-refresh for a scrollable element.
 *
 * Touch-only by design (desktop has explicit refresh affordances) and inert
 * when no `onRefresh` handler is supplied, so list pages opt in individually.
 * Returns the live pull distance so callers can render an indicator without
 * re-implementing the gesture math.
 */
export function usePullToRefresh({
  targetRef,
  onRefresh,
  threshold = 72,
}: Options) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const refreshingRef = useRef(false);

  const run = useCallback(async () => {
    if (!onRefresh || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setDistance(threshold);
    try {
      await onRefresh();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setDistance(0);
    }
  }, [onRefresh, threshold]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el || !onRefresh) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      armed.current = el.scrollTop <= 0;
      startY.current = armed.current ? e.touches[0].clientY : null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armed.current || startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setDistance(0);
        return;
      }
      // Rubber-band the drag so it feels damped past the threshold.
      setDistance(Math.min(threshold * 1.6, delta * 0.5));
    };

    const onTouchEnd = () => {
      if (!armed.current) return;
      armed.current = false;
      startY.current = null;
      setDistance((d) => {
        if (d >= threshold) void run();
        else return 0;
        return d;
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [targetRef, onRefresh, threshold, run]);

  return {
    distance,
    refreshing,
    /** True once the user has dragged far enough to trigger on release. */
    armed: distance >= threshold,
  };
}
