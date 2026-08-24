import { useEffect, useState } from "react";
import {
  documentHasMapSurface,
  isMapPainted,
  onMapPainted,
} from "@/lib/mapPaintSignal";

const INTERACTION_EVENTS = [
  "pointerdown",
  "touchstart",
  "keydown",
  "wheel",
  "scroll",
] as const;

/** Safety net: on a map route, never wait forever for a paint that failed. */
const MAP_PAINT_TIMEOUT_MS = 12_000;

/**
 * Resolves to `true` only after BOTH:
 *  1. the page has finished loading and (on map routes) the map has painted, and
 *  2. the user has interacted for the first time (tap, key, scroll, wheel).
 *
 * Permission prompts hang off this so they never cover the first paint or
 * steal attention before the user has engaged — a large chunk of the measured
 * LCP render delay on mobile was the priming dialog painting over the map.
 */
export function useDeferredPromptTrigger(enabled = true): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || ready || typeof window === "undefined") return;

    let cancelled = false;
    let detachInteraction: (() => void) | null = null;
    let detachPaint: (() => void) | null = null;
    let paintTimer: number | undefined;

    const armInteraction = () => {
      if (cancelled || detachInteraction) return;
      const fire = () => {
        if (cancelled) return;
        detachInteraction?.();
        detachInteraction = null;
        setReady(true);
      };
      const opts = { passive: true, capture: true } as const;
      INTERACTION_EVENTS.forEach((e) =>
        window.addEventListener(e, fire, opts),
      );
      detachInteraction = () =>
        INTERACTION_EVENTS.forEach((e) =>
          window.removeEventListener(e, fire, opts),
        );
    };

    const afterPaint = () => {
      if (cancelled) return;
      if (!documentHasMapSurface() || isMapPainted()) {
        armInteraction();
        return;
      }
      detachPaint = onMapPainted(armInteraction);
      paintTimer = window.setTimeout(armInteraction, MAP_PAINT_TIMEOUT_MS);
    };

    if (document.readyState === "complete") {
      afterPaint();
    } else {
      window.addEventListener("load", afterPaint, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", afterPaint);
      detachInteraction?.();
      detachPaint?.();
      if (paintTimer) window.clearTimeout(paintTimer);
    };
  }, [enabled, ready]);

  return ready;
}
