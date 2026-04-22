import { useEffect, useMemo, useState } from "react";
import type { Venue } from "@/types/venue";
import { isVenueOpenNow } from "@/lib/venue-hours";

/**
 * Filter a venue list down to those currently open according to Google Places
 * `openingHours` (weekday_text) evaluated against the device's local clock.
 *
 * Behavior:
 *  - Venues whose hours are unknown/unparseable are kept visible (fail-open).
 *  - Re-evaluates every minute and on tab visibility change so markers are
 *    removed/added back as opening hours roll over.
 */
export function useOpenVenues(venues: Venue[]): Venue[] {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Align ticks to the top of each minute for crisp hour roll-overs.
    const scheduleNext = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      return window.setTimeout(() => {
        setTick((t) => t + 1);
        timer = scheduleNext();
      }, msToNextMinute + 50);
    };
    let timer = scheduleNext();

    const onVisible = () => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return useMemo(() => {
    const now = new Date();
    return venues.filter((v) => {
      const open = isVenueOpenNow(v.openingHours, now);
      // Fail-open when hours are unknown so we don't hide everything that
      // hasn't been enriched by Google Places yet.
      return open !== false;
    });
    // tick is intentionally a dependency to force re-evaluation each minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venues, tick]);
}