import { useEffect } from "react";

/**
 * Runtime viewport reflow guard.
 *
 * Orientation changes and mobile browser-chrome show/hide events resize the
 * viewport asynchronously: `resize` can fire *before* the new dimensions are
 * committed, which makes `dvh`/`svh` based layouts settle over two or three
 * frames and visibly flicker (content jumps, transitions animate to the new
 * height).
 *
 * This hook:
 *  - measures the real `dvh` / `svh` / `lvh` values with an offscreen probe and
 *    publishes them as `--viewport-dvh|svh|lvh` (px) so JS-driven or legacy
 *    layouts can share the exact numbers CSS is using,
 *  - re-measures on `resize`, `orientationchange`, Screen Orientation changes
 *    and `visualViewport` resize/scroll, batched into a single rAF,
 *  - sets `data-orientation="portrait|landscape"` on <html>,
 *  - adds `.is-reflowing` to <html> while the viewport settles so transitions
 *    and animations are suppressed for those frames — the reflow lands in one
 *    paint instead of animating into place.
 *
 * Safe to mount once at the app root; it is a no-op during SSR.
 */
export function useViewportReflow(): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;

    const root = document.documentElement;

    // A single reusable probe avoids per-measurement DOM churn.
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:1px;pointer-events:none;visibility:hidden;z-index:-1;";
    document.body.appendChild(probe);

    const measureUnit = (unit: "dvh" | "svh" | "lvh"): number => {
      probe.style.height = `100${unit}`;
      const px = probe.getBoundingClientRect().height;
      // Browsers without the unit collapse the probe to 0 — fall back to the
      // layout viewport so consumers never read a zero height.
      return px > 0 ? px : window.innerHeight;
    };

    let rafId = 0;
    let settleId = 0;
    let last = "";
    // Cheap synchronous snapshot used to decide whether a resize event is
    // large enough to justify suppressing motion at all.
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    // Sub-pixel/URL-bar jitter below this many px never causes visible
    // flicker, so the guard stays off and animations keep running.
    const FLICKER_THRESHOLD_PX = 4;

    const releaseGuard = () => root.classList.remove("is-reflowing");

    const applyMeasurements = () => {
      rafId = 0;
      const dvh = measureUnit("dvh");
      const svh = measureUnit("svh");
      const lvh = measureUnit("lvh");
      const orientation =
        window.innerHeight >= window.innerWidth ? "portrait" : "landscape";
      const signature = `${dvh}|${svh}|${lvh}|${orientation}`;
      if (signature === last) {
        releaseGuard();
        return;
      }
      last = signature;

      root.style.setProperty("--viewport-dvh", `${dvh}px`);
      root.style.setProperty("--viewport-svh", `${svh}px`);
      root.style.setProperty("--viewport-lvh", `${lvh}px`);
      root.dataset.orientation = orientation;

      // Release the flicker guard only after the new sizes have painted.
      settleId = requestAnimationFrame(() => {
        settleId = requestAnimationFrame(() => {
          releaseGuard();
        });
      });
    };

    const schedule = (suppressTransitions: boolean) => {
      if (suppressTransitions) root.classList.add("is-reflowing");
      if (settleId) {
        cancelAnimationFrame(settleId);
        settleId = 0;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(applyMeasurements);
    };

    // Initial measurement: no transition suppression needed on first paint.
    schedule(false);

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const significant =
        Math.abs(w - lastW) > FLICKER_THRESHOLD_PX ||
        Math.abs(h - lastH) > FLICKER_THRESHOLD_PX;
      lastW = w;
      lastH = h;
      schedule(significant);
    };
    // visualViewport scroll fires while the URL bar collapses; the layout
    // viewport is unchanged there, so re-measure without the guard to keep
    // scrolling smooth.
    const onVisualScroll = () => schedule(false);

    // Returning from the background (push-notification deep link, app switch,
    // bfcache restore) can surface a viewport that changed while the document
    // was hidden — rotation, browser chrome, keyboard. Re-measure with the
    // guard so the first visible paint already has the right height instead of
    // jumping a frame later.
    const onResume = () => {
      if (document.visibilityState !== "visible") return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const changed = w !== lastW || h !== lastH;
      lastW = w;
      lastH = h;
      schedule(changed);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onVisualScroll);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    const screenOrientation = window.screen?.orientation;
    screenOrientation?.addEventListener?.("change", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onVisualScroll);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
      screenOrientation?.removeEventListener?.("change", onResize);
      if (rafId) cancelAnimationFrame(rafId);
      if (settleId) cancelAnimationFrame(settleId);
      root.classList.remove("is-reflowing");
      probe.remove();
    };
  }, []);
}
