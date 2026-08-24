import { useEffect, useState, type RefObject } from "react";

interface Options {
  /** Start observing only after the page load event (keeps LCP clean). */
  waitForLoad?: boolean;
  /** Grow the viewport box so the map boots just before it scrolls in. */
  rootMargin?: string;
  /** Skip observing entirely (e.g. not hydrated yet). */
  enabled?: boolean;
}

/**
 * True once the element has entered (or is already inside) the viewport, and
 * only after the initial page load has settled.
 *
 * Used to gate the heavy Mapbox GL chunk: the bundle is never fetched or
 * evaluated for a viewport that isn't showing a map, and never during the
 * critical first-paint window.
 */
export function useInViewAfterPaint(
  ref: RefObject<Element | null>,
  { waitForLoad = true, rootMargin = "200px", enabled = true }: Options = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!enabled || inView || typeof window === "undefined") return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const start = () => {
      if (cancelled) return;
      const el = ref.current;
      // No element or no IO support: fail open so the map always renders.
      if (!el || !("IntersectionObserver" in window)) {
        setInView(true);
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            if (!cancelled) setInView(true);
          }
        },
        { rootMargin },
      );
      observer.observe(el);
    };

    if (!waitForLoad || document.readyState === "complete") {
      // Still yield a frame so the skeleton paints before GL work begins.
      const raf = requestAnimationFrame(start);
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        observer?.disconnect();
      };
    }

    window.addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
      observer?.disconnect();
    };
  }, [ref, enabled, inView, rootMargin, waitForLoad]);

  return inView;
}
