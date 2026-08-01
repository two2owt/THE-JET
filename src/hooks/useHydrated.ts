import { useEffect, useState } from "react";

/**
 * Hydration readiness guard.
 *
 * Returns `false` on the very first render (when React has mounted the markup
 * but event handlers may not be attached yet on slow devices) and flips to
 * `true` after the browser has painted a frame with listeners in place.
 *
 * Consumers use this to avoid the intermittent "click lands before React is
 * listening" class of bug in auth flows, where a tap on Sign in / Forgot? /
 * Google could be silently dropped. It also exposes
 * `document.documentElement.dataset.hydrated` so end-to-end tests and CSS can
 * observe readiness without arbitrary timeouts.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let frame2 = 0;
    // Two rAFs: the first runs before the commit is painted, the second lands
    // after the browser has painted the interactive tree.
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (typeof document !== "undefined") {
          document.documentElement.dataset.hydrated = "true";
        }
        setHydrated(true);
      });
    });

    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, []);

  return hydrated;
}
